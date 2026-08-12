import { config } from '../config.js';
import { logger } from '../logger.js';
import { fetchJson } from '../sources/http.js';
import { secLimiter } from '../sources/limiter.js';
import type { CompanyRef, FinancialPeriod } from '../types.js';
import { emptyPeriod, type FinancialsProvider } from './provider.js';

const DATA_HOST = 'https://data.sec.gov';

interface XbrlFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
  frame?: string;
}

interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { units: Record<string, XbrlFact[]> }>>;
}

/* -------------------------------------------------------------------------- */
/* concept selection                                                           */
/* -------------------------------------------------------------------------- */

/**
 * XBRL lets filers pick among several tags for the same economic concept, and
 * they change tags between years. For each field we try candidates in order and
 * merge every candidate that has data, preferring earlier ones on conflict.
 */
const CONCEPTS = {
  revenue: [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'Revenues',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
  ],
  grossProfit: ['GrossProfit'],
  operatingIncome: ['OperatingIncomeLoss'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  operatingCashFlow: [
    'NetCashProvidedByUsedInOperatingActivities',
    'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  ],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  cash: [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
  ],
  longTermDebt: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  currentDebt: ['LongTermDebtCurrent', 'DebtCurrent'],
  sharesDiluted: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
} as const;

type ConceptKey = keyof typeof CONCEPTS;

const DURATION_CONCEPTS = new Set<ConceptKey>([
  'revenue',
  'grossProfit',
  'operatingIncome',
  'netIncome',
  'operatingCashFlow',
  'capex',
  'sharesDiluted',
]);

function daysBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000;
}

/**
 * Pull the facts for one concept, filtered to the requested period type and
 * deduped by period-end (keeping the most recently filed value, which reflects
 * any restatement).
 */
function selectFacts(
  facts: CompanyFacts,
  concept: ConceptKey,
  period: 'annual' | 'quarterly',
): Map<string, number> {
  const isDuration = DURATION_CONCEPTS.has(concept);
  const unitKey = concept === 'sharesDiluted' ? 'shares' : 'USD';
  const byEnd = new Map<string, { val: number; filed: string }>();

  for (const tag of CONCEPTS[concept]) {
    const entry = facts.facts?.['us-gaap']?.[tag];
    const series = entry?.units?.[unitKey];
    if (!series) continue;

    for (const f of series) {
      if (isDuration) {
        if (!f.start) continue;
        const len = daysBetween(f.start, f.end);
        if (period === 'annual' && (len < 330 || len > 400)) continue;
        if (period === 'quarterly' && (len < 75 || len > 105)) continue;
      } else {
        if (f.start) continue; // instant concepts carry no start
      }

      if (period === 'annual' && f.form !== '10-K' && f.form !== '20-F' && f.form !== '40-F') continue;
      if (period === 'quarterly' && f.form !== '10-Q' && f.form !== '10-K') continue;

      const existing = byEnd.get(f.end);
      // Later filings supersede earlier ones for the same period end.
      if (!existing || f.filed > existing.filed) {
        byEnd.set(f.end, { val: f.val, filed: f.filed });
      }
    }
    // Once a candidate tag produced data we still let later tags fill gaps,
    // but never overwrite a value we already have from a preferred tag.
  }

  return new Map([...byEnd].map(([end, v]) => [end, v.val]));
}

/** Find the instant-concept value effective at or just before a period end. */
function valueAsOf(series: Map<string, number>, end: string): number | null {
  if (series.has(end)) return series.get(end) ?? null;
  const candidates = [...series.keys()].filter((k) => k <= end).sort();
  const nearest = candidates[candidates.length - 1];
  if (!nearest) return null;
  // Only accept a balance-sheet date within ~100 days of the period end.
  return Math.abs(daysBetween(nearest, end)) <= 100 ? (series.get(nearest) ?? null) : null;
}

export function buildPeriodsFromFacts(
  facts: CompanyFacts,
  period: 'annual' | 'quarterly',
  limit: number,
): FinancialPeriod[] {
  const series: Record<ConceptKey, Map<string, number>> = {} as never;
  for (const key of Object.keys(CONCEPTS) as ConceptKey[]) {
    series[key] = selectFacts(facts, key, period);
  }

  // Period ends are driven by whichever income-statement line we found.
  const ends = new Set<string>([
    ...series.revenue.keys(),
    ...series.netIncome.keys(),
    ...series.operatingIncome.keys(),
  ]);

  const sorted = [...ends].sort().reverse().slice(0, limit);

  return sorted.map((end) => {
    const year = end.slice(0, 4);
    const label = period === 'annual' ? `FY${year}` : end;
    const p = emptyPeriod(label, end);

    p.revenue = series.revenue.get(end) ?? null;
    p.grossProfit = series.grossProfit.get(end) ?? null;
    p.operatingIncome = series.operatingIncome.get(end) ?? null;
    p.netIncome = series.netIncome.get(end) ?? null;
    p.operatingCashFlow = series.operatingCashFlow.get(end) ?? null;
    p.capex = series.capex.get(end) ?? null;
    p.sharesDiluted = series.sharesDiluted.get(end) ?? null;
    p.cash = valueAsOf(series.cash, end);

    const ltd = valueAsOf(series.longTermDebt, end);
    const cd = valueAsOf(series.currentDebt, end);
    p.totalDebt = ltd === null && cd === null ? null : (ltd ?? 0) + (cd ?? 0);

    if (p.operatingCashFlow !== null && p.capex !== null) {
      p.freeCashFlow = p.operatingCashFlow - Math.abs(p.capex);
    }

    return p;
  });
}

/* -------------------------------------------------------------------------- */
/* provider                                                                    */
/* -------------------------------------------------------------------------- */

const factsCache = new Map<string, { facts: CompanyFacts; at: number }>();
const FACTS_TTL_MS = 6 * 60 * 60 * 1000;

async function loadFacts(cik: string): Promise<CompanyFacts | null> {
  const padded = cik.padStart(10, '0');
  const cached = factsCache.get(padded);
  if (cached && Date.now() - cached.at < FACTS_TTL_MS) return cached.facts;

  try {
    const facts = await secLimiter.run(() =>
      fetchJson<CompanyFacts>(`${DATA_HOST}/api/xbrl/companyfacts/CIK${padded}.json`, {
        userAgent: config.SEC_USER_AGENT,
        timeoutMs: 45_000,
      }),
    );
    factsCache.set(padded, { facts, at: Date.now() });
    return facts;
  } catch (err) {
    logger.warn({ cik: padded, err: (err as Error).message }, 'SEC companyfacts fetch failed');
    return null;
  }
}

/**
 * Free, authoritative historical financials straight from XBRL filings. No key,
 * no quota. Does not serve live price/market cap — pair it with a quote source.
 */
export class SecXbrlProvider implements FinancialsProvider {
  readonly id = 'sec-xbrl';
  readonly configured = true;

  async getAnnualFinancials(ref: CompanyRef, limit: number): Promise<FinancialPeriod[] | null> {
    if (!ref.cik) return null;
    const facts = await loadFacts(ref.cik);
    return facts ? buildPeriodsFromFacts(facts, 'annual', limit) : null;
  }

  async getQuarterlyFinancials(ref: CompanyRef, limit: number): Promise<FinancialPeriod[] | null> {
    if (!ref.cik) return null;
    const facts = await loadFacts(ref.cik);
    return facts ? buildPeriodsFromFacts(facts, 'quarterly', limit) : null;
  }
}
