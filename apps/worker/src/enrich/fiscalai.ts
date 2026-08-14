import { config } from '../config.js';
import { logger } from '../logger.js';
import { fetchJson } from '../sources/http.js';
import type { CompanyRef, FinancialPeriod, PricePoint, Transcript } from '../types.js';
import { emptyPeriod, num, type CompanyProfile, type FinancialsProvider } from './provider.js';

/**
 * Fiscal.ai (formerly FinChat).
 *
 * ⚠️  UNVERIFIED CONTRACT. docs.fiscal.ai was unreachable from the build
 * environment, so the paths below are inferred, not confirmed — only
 * `/v2/company/segments-and-kpis` is known-good from public material. Before
 * relying on this provider, open https://docs.fiscal.ai/docs/api-reference and
 * reconcile two things:
 *
 *   1. ENDPOINTS — the path for each call.
 *   2. FIELDS    — the response field names each mapper reads.
 *
 * Both are isolated at the top of this file specifically so that fixing them is
 * a five-minute edit rather than a rewrite. Everything reads through `pick()`,
 * which tries several plausible spellings, so partial mismatches degrade to
 * nulls instead of throwing.
 *
 * If you would rather not maintain a REST adapter at all: Fiscal.ai ships an MCP
 * server, and the WhatsApp chat agent can call it directly — set
 * FISCALAI_MCP_URL and the agent gains their tools with no mapping code. See
 * README "Fiscal.ai via MCP".
 */
export class FiscalAiProvider implements FinancialsProvider {
  readonly id = 'fiscalai';
  readonly configured: boolean;

  private static readonly ENDPOINTS = {
    search: (q: string) => `/v2/company/search?query=${encodeURIComponent(q)}`,
    profile: (t: string) => `/v2/company/profile?ticker=${encodeURIComponent(t)}`,
    prices: (t: string) => `/v2/company/stock-prices?ticker=${encodeURIComponent(t)}&limit=1`,
    income: (t: string, p: string, n: number) =>
      `/v2/company/income-statement?ticker=${encodeURIComponent(t)}&period=${p}&limit=${n}`,
    cashFlow: (t: string, p: string, n: number) =>
      `/v2/company/cash-flow-statement?ticker=${encodeURIComponent(t)}&period=${p}&limit=${n}`,
    balance: (t: string, p: string, n: number) =>
      `/v2/company/balance-sheet-statement?ticker=${encodeURIComponent(t)}&period=${p}&limit=${n}`,
    /** Confirmed path. The differentiator versus other vendors. */
    segments: (t: string) => `/v2/company/segments-and-kpis?ticker=${encodeURIComponent(t)}`,
    transcripts: (t: string) =>
      `/v2/company/event-transcripts?ticker=${encodeURIComponent(t)}&limit=1`,
  };

  /** Candidate field spellings, tried in order. */
  private static readonly FIELDS = {
    date: ['periodEndDate', 'endDate', 'date', 'fiscalPeriodEnd'],
    fiscalYear: ['fiscalYear', 'calendarYear', 'year'],
    fiscalPeriod: ['fiscalPeriod', 'period', 'quarter'],
    revenue: ['revenue', 'totalRevenue', 'revenues', 'sales'],
    grossProfit: ['grossProfit', 'grossIncome'],
    operatingIncome: ['operatingIncome', 'operatingProfit', 'ebit'],
    netIncome: ['netIncome', 'netIncomeToCompany', 'netProfit'],
    sharesDiluted: ['dilutedSharesOutstanding', 'weightedAverageDilutedShares', 'dilutedShares'],
    operatingCashFlow: ['operatingCashFlow', 'cashFlowFromOperations', 'netCashFromOperatingActivities'],
    capex: ['capitalExpenditures', 'capex', 'purchaseOfPPE'],
    freeCashFlow: ['freeCashFlow', 'fcf'],
    cash: ['cashAndCashEquivalents', 'cashAndEquivalents', 'cash'],
    totalDebt: ['totalDebt', 'debt', 'grossDebt'],
    price: ['price', 'close', 'closePrice', 'lastPrice'],
    marketCap: ['marketCap', 'marketCapitalization'],
    changePercent: ['changePercent', 'percentChange', 'changesPercentage'],
    ticker: ['ticker', 'symbol'],
    name: ['companyName', 'name'],
    description: ['description', 'businessDescription', 'longDescription'],
    sector: ['sector'],
    industry: ['industry'],
    employees: ['employees', 'fullTimeEmployees', 'employeeCount'],
    country: ['country', 'countryCode'],
    website: ['website', 'url', 'homepageUrl'],
    ipoDate: ['ipoDate', 'listingDate'],
    exchange: ['exchange', 'exchangeShortName', 'primaryExchange'],
  } as const;

  constructor(
    private readonly apiKey = config.FISCALAI_API_KEY,
    private readonly baseUrl = config.FISCALAI_BASE_URL,
  ) {
    this.configured = Boolean(apiKey);
  }

  private async get<T>(path: string): Promise<T | null> {
    if (!this.configured) return null;
    try {
      return await fetchJson<T>(`${this.baseUrl}${path}`, {
        timeoutMs: 20_000,
        // Key travels in a header, not the query string, so it stays out of logs.
        headers: { 'x-api-key': this.apiKey, authorization: `Bearer ${this.apiKey}` },
      });
    } catch (err) {
      logger.warn(
        { provider: 'fiscalai', path: path.split('?')[0], err: (err as Error).message },
        'Fiscal.ai request failed — check ENDPOINTS against docs.fiscal.ai',
      );
      return null;
    }
  }

  async resolve(query: string): Promise<CompanyRef | null> {
    const res = await this.get<unknown>(FiscalAiProvider.ENDPOINTS.search(query));
    const first = firstRow(res);
    if (!first) return null;
    const ticker = str(pick(first, FiscalAiProvider.FIELDS.ticker));
    if (!ticker) return null;
    return {
      ticker: ticker.toUpperCase(),
      name: str(pick(first, FiscalAiProvider.FIELDS.name)) ?? ticker,
      exchange: str(pick(first, FiscalAiProvider.FIELDS.exchange)) ?? undefined,
    };
  }

  async getProfile(ref: CompanyRef): Promise<CompanyProfile | null> {
    const res = await this.get<unknown>(FiscalAiProvider.ENDPOINTS.profile(ref.ticker));
    const p = firstRow(res);
    if (!p) return null;
    const F = FiscalAiProvider.FIELDS;
    return {
      description: str(pick(p, F.description)),
      sector: str(pick(p, F.sector)),
      industry: str(pick(p, F.industry)),
      employees: num(pick(p, F.employees)),
      country: str(pick(p, F.country)),
      ipoDate: str(pick(p, F.ipoDate)),
      website: str(pick(p, F.website)),
    };
  }

  async getQuote(ref: CompanyRef): Promise<PricePoint | null> {
    const res = await this.get<unknown>(FiscalAiProvider.ENDPOINTS.prices(ref.ticker));
    const q = firstRow(res);
    if (!q) return null;
    const F = FiscalAiProvider.FIELDS;
    return {
      price: num(pick(q, F.price)),
      marketCap: num(pick(q, F.marketCap)),
      changePercent: num(pick(q, F.changePercent)),
      currency: str(pick(q, ['currency'])) ?? 'USD',
    };
  }

  private async getStatements(
    ref: CompanyRef,
    period: 'annual' | 'quarterly',
    limit: number,
  ): Promise<FinancialPeriod[] | null> {
    const E = FiscalAiProvider.ENDPOINTS;
    const F = FiscalAiProvider.FIELDS;

    const [incomeRes, cashRes, balanceRes] = await Promise.all([
      this.get<unknown>(E.income(ref.ticker, period, limit)),
      this.get<unknown>(E.cashFlow(ref.ticker, period, limit)),
      this.get<unknown>(E.balance(ref.ticker, period, limit)),
    ]);

    const income = rows(incomeRes);
    if (!income.length) return null;

    const keyOf = (r: Record<string, unknown>) => str(pick(r, F.date)) ?? '';
    const cashByDate = new Map(rows(cashRes).map((r) => [keyOf(r), r]));
    const balByDate = new Map(rows(balanceRes).map((r) => [keyOf(r), r]));

    return income.map((row) => {
      const date = keyOf(row);
      const year = str(pick(row, F.fiscalYear)) ?? date.slice(0, 4);
      const q = str(pick(row, F.fiscalPeriod));
      const label = period === 'annual' ? `FY${year}` : `${year}-${q ?? ''}`;

      const p = emptyPeriod(label, date);
      p.revenue = num(pick(row, F.revenue));
      p.grossProfit = num(pick(row, F.grossProfit));
      p.operatingIncome = num(pick(row, F.operatingIncome));
      p.netIncome = num(pick(row, F.netIncome));
      p.sharesDiluted = num(pick(row, F.sharesDiluted));

      const cf = cashByDate.get(date);
      if (cf) {
        p.operatingCashFlow = num(pick(cf, F.operatingCashFlow));
        p.capex = num(pick(cf, F.capex));
        p.freeCashFlow = num(pick(cf, F.freeCashFlow));
      }

      const bs = balByDate.get(date);
      if (bs) {
        p.cash = num(pick(bs, F.cash));
        p.totalDebt = num(pick(bs, F.totalDebt));
      }

      return p;
    });
  }

  getAnnualFinancials(ref: CompanyRef, limit: number): Promise<FinancialPeriod[] | null> {
    return this.getStatements(ref, 'annual', limit);
  }

  getQuarterlyFinancials(ref: CompanyRef, limit: number): Promise<FinancialPeriod[] | null> {
    return this.getStatements(ref, 'quarterly', limit);
  }

  /** Revenue split by reported segment plus company-specific KPIs. */
  async getSegmentsAndKpis(ref: CompanyRef): Promise<unknown | null> {
    return this.get<unknown>(FiscalAiProvider.ENDPOINTS.segments(ref.ticker));
  }

  async getTranscript(ref: CompanyRef): Promise<Transcript | null> {
    const res = await this.get<unknown>(FiscalAiProvider.ENDPOINTS.transcripts(ref.ticker));
    const row = rows(res)[0];
    if (!row) return null;

    const content =
      str(pick(row, ['transcript', 'content', 'text', 'body'])) ??
      // Some shapes return speaker-segmented arrays rather than one blob.
      joinSegments(pick(row, ['segments', 'items', 'paragraphs']));
    if (!content) return null;

    const year = str(pick(row, ['fiscalYear', 'year']));
    const quarter = str(pick(row, ['fiscalPeriod', 'quarter', 'period']));

    return {
      ticker: ref.ticker,
      period: [quarter, year].filter(Boolean).join(' ') || 'latest',
      date: str(pick(row, ['date', 'eventDate', 'publishedAt'])) ?? '',
      content,
      source: 'Fiscal.ai',
    };
  }
}

/** Flatten a speaker-segmented transcript into readable text. */
function joinSegments(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const parts = value
    .map((seg) => {
      if (typeof seg === 'string') return seg;
      if (seg && typeof seg === 'object') {
        const o = seg as Record<string, unknown>;
        const speaker = str(pick(o, ['speaker', 'name', 'speakerName']));
        const text = str(pick(o, ['text', 'content', 'transcript']));
        if (!text) return null;
        return speaker ? `${speaker}: ${text}` : text;
      }
      return null;
    })
    .filter((s): s is string => Boolean(s));
  return parts.length ? parts.join('\n\n') : null;
}

/* -------------------------------------------------------------------------- */
/* defensive readers                                                           */
/* -------------------------------------------------------------------------- */

/** Read the first present key from a list of candidate names. */
export function pick(obj: Record<string, unknown>, names: readonly string[]): unknown {
  for (const n of names) {
    if (obj[n] !== undefined && obj[n] !== null) return obj[n];
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

/** Accept `[...]`, `{data:[...]}`, `{results:[...]}`, or a bare object. */
export function rows(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['data', 'results', 'items', 'financials']) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
    return [obj];
  }
  return [];
}

function firstRow(payload: unknown): Record<string, unknown> | null {
  return rows(payload)[0] ?? null;
}
