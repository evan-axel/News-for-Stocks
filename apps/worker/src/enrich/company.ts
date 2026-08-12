import { providerOrder } from '../config.js';
import type { Repo } from '../db/repo.js';
import { logger } from '../logger.js';
import type { CompanyContext, CompanyRef, Transcript } from '../types.js';
import { buildTrend } from './derive.js';
import { FiscalAiProvider } from './fiscalai.js';
import { FmpProvider } from './fmp.js';
import type { FinancialsProvider } from './provider.js';
import { SecXbrlProvider } from './sec-xbrl.js';

const CACHE_TTL_MINUTES = 30;
const ANNUAL_PERIODS = 8;
const QUARTERLY_PERIODS = 8;

function buildProviders(): FinancialsProvider[] {
  const registry: Record<string, () => FinancialsProvider> = {
    fiscalai: () => new FiscalAiProvider(),
    fmp: () => new FmpProvider(),
    'sec-xbrl': () => new SecXbrlProvider(),
  };

  return providerOrder()
    .map((id) => registry[id]?.())
    .filter((p): p is FinancialsProvider => Boolean(p?.configured));
}

let providersCache: FinancialsProvider[] | null = null;
function providers(): FinancialsProvider[] {
  providersCache ??= buildProviders();
  return providersCache;
}

/** Test seam: swap the provider chain. */
export function setProviders(list: FinancialsProvider[] | null): void {
  providersCache = list;
}

/**
 * Try each provider in order until one returns a usable value.
 * Records which provider answered so the final context can be honest about
 * where each number came from.
 */
async function firstAnswer<T>(
  label: string,
  used: Set<string>,
  warnings: string[],
  call: (p: FinancialsProvider) => Promise<T | null> | undefined,
): Promise<T | null> {
  for (const provider of providers()) {
    const promise = call(provider);
    if (!promise) continue; // provider does not implement this capability
    try {
      const result = await promise;
      const empty = result === null || (Array.isArray(result) && result.length === 0);
      if (!empty) {
        used.add(provider.id);
        return result;
      }
    } catch (err) {
      logger.warn({ provider: provider.id, label, err: (err as Error).message }, 'provider call threw');
    }
  }
  warnings.push(`No provider returned ${label}.`);
  return null;
}

/** Fill in CIK and canonical name from the local SEC index when possible. */
export function hydrateRef(input: CompanyRef, repo: Repo): CompanyRef {
  if (input.cik) return input;
  const hit = repo.lookupTicker(input.ticker);
  return hit ? { ...input, cik: hit.cik, name: input.name || hit.name } : input;
}

/**
 * Resolve free text ("Apple", "AAPL", "apple inc") to a company.
 * Local SEC index first — it is instant, free, and authoritative for US issuers.
 */
export async function resolveCompanyRef(query: string, repo: Repo): Promise<CompanyRef | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const direct = repo.lookupTicker(trimmed);
  if (direct) return { ticker: direct.ticker, name: direct.name, cik: direct.cik };

  const { normalizeCompanyName } = await import('../db/repo.js');
  const byName = repo.lookupByNormalizedName(normalizeCompanyName(trimmed));
  if (byName) return { ticker: byName.ticker, name: byName.name, cik: byName.cik };

  const { resolveByName } = await import('../matching/tickers.js');
  const fuzzy = resolveByName(trimmed, repo);
  if (fuzzy) return fuzzy;

  // Last resort: ask a data provider (covers non-US listings absent from EDGAR).
  for (const provider of providers()) {
    try {
      const hit = await provider.resolve?.(trimmed);
      if (hit) return hydrateRef(hit, repo);
    } catch {
      /* try the next provider */
    }
  }
  return null;
}

/**
 * Latest (or a specific) earnings call transcript, from the first provider that
 * serves one. Transcripts are large, so this is deliberately not part of
 * `getCompanyContext` — it is fetched only when the conversation asks for it.
 */
export async function getTranscript(
  ref: CompanyRef,
  repo: Repo,
  opts: { year?: number; quarter?: number } = {},
): Promise<Transcript | null> {
  const hydrated = hydrateRef(ref, repo);
  for (const provider of providers()) {
    try {
      const t = await provider.getTranscript?.(hydrated, opts);
      if (t?.content) return t;
    } catch (err) {
      logger.warn(
        { provider: provider.id, err: (err as Error).message },
        'transcript fetch failed',
      );
    }
  }
  return null;
}

/**
 * Assemble everything known about a company.
 *
 * Every section is independently optional: a missing insider feed or an
 * unconfigured provider produces a warning rather than a failure, because a
 * partial answer texted promptly beats a complete one that never arrives.
 */
export async function getCompanyContext(
  ref: CompanyRef,
  repo: Repo,
  opts: { fresh?: boolean } = {},
): Promise<CompanyContext> {
  const hydrated = hydrateRef(ref, repo);

  if (!opts.fresh) {
    const cached = repo.getCachedCompany(hydrated.ticker, CACHE_TTL_MINUTES);
    if (cached) return cached;
  }

  const used = new Set<string>();
  const warnings: string[] = [];

  const [profile, quote, annualPeriods, quarterlyPeriods, executives, insiderTrades] =
    await Promise.all([
      firstAnswer('company profile', used, warnings, (p) => p.getProfile?.(hydrated)),
      firstAnswer('a live quote', used, warnings, (p) => p.getQuote?.(hydrated)),
      firstAnswer('annual financials', used, warnings, (p) =>
        p.getAnnualFinancials?.(hydrated, ANNUAL_PERIODS),
      ),
      firstAnswer('quarterly financials', used, warnings, (p) =>
        p.getQuarterlyFinancials?.(hydrated, QUARTERLY_PERIODS),
      ),
      firstAnswer('executives', used, warnings, (p) => p.getExecutives?.(hydrated)),
      firstAnswer('insider trades', used, warnings, (p) => p.getInsiderTrades?.(hydrated, 15)),
    ]);

  const context: CompanyContext = {
    ref: hydrated,
    profile: profile ?? {
      description: null,
      sector: null,
      industry: null,
      employees: null,
      country: null,
      ipoDate: null,
      website: null,
    },
    quote: quote ?? { price: null, marketCap: null, changePercent: null, currency: 'USD' },
    annual: annualPeriods ? buildTrend(annualPeriods) : null,
    quarterly: quarterlyPeriods ? buildTrend(quarterlyPeriods) : null,
    executives: executives ?? [],
    insiderTrades: insiderTrades ?? [],
    sources: [...used],
    warnings,
    fetchedAt: new Date(),
  };

  repo.setCachedCompany(hydrated.ticker, context);
  return context;
}
