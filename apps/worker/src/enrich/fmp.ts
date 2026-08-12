import { config } from '../config.js';
import { logger } from '../logger.js';
import { fetchJson } from '../sources/http.js';
import type {
  CompanyRef,
  Executive,
  FinancialPeriod,
  InsiderTrade,
  PricePoint,
  Transcript,
  TranscriptRef,
} from '../types.js';
import { emptyPeriod, num, type CompanyProfile, type FinancialsProvider } from './provider.js';

/* Raw shapes, kept loose because FMP adds and renames fields between plans. */
interface FmpProfile {
  symbol?: string;
  companyName?: string;
  price?: number;
  mktCap?: number;
  marketCap?: number;
  changes?: number;
  changesPercentage?: number | string;
  currency?: string;
  exchangeShortName?: string;
  industry?: string;
  sector?: string;
  description?: string;
  website?: string;
  fullTimeEmployees?: string | number;
  country?: string;
  ipoDate?: string;
  cik?: string;
}

interface FmpIncome {
  date?: string;
  calendarYear?: string;
  period?: string;
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  weightedAverageShsOutDil?: number;
}

interface FmpCashFlow {
  date?: string;
  operatingCashFlow?: number;
  capitalExpenditure?: number;
  freeCashFlow?: number;
}

interface FmpBalance {
  date?: string;
  cashAndCashEquivalents?: number;
  cashAndShortTermInvestments?: number;
  totalDebt?: number;
}

interface FmpExecutive {
  title?: string;
  name?: string;
  pay?: number | null;
  titleSince?: number | string | null;
}

interface FmpInsider {
  transactionDate?: string;
  filingDate?: string;
  reportingName?: string;
  typeOfOwner?: string;
  transactionType?: string;
  acquistionOrDisposition?: string; // FMP's spelling
  acquisitionOrDisposition?: string;
  securitiesTransacted?: number;
  price?: number;
}

interface FmpSearchHit {
  symbol?: string;
  name?: string;
  exchangeShortName?: string;
}

/** Map FMP's transaction descriptors onto a plain buy/sell/other. */
export function normalizeInsiderDirection(row: FmpInsider): InsiderTrade['direction'] {
  const ad = (row.acquistionOrDisposition ?? row.acquisitionOrDisposition ?? '').toUpperCase();
  if (ad === 'A') return 'buy';
  if (ad === 'D') return 'sell';
  const type = (row.transactionType ?? '').toUpperCase();
  if (type.startsWith('P')) return 'buy';
  if (type.startsWith('S')) return 'sell';
  return 'other';
}

/**
 * Financial Modeling Prep.
 *
 * NOTE: endpoint paths follow FMP's documented v3/v4 REST API. They could not be
 * exercised from the build environment (egress blocked), so if a call 404s check
 * the path against your plan's docs — every path is in ENDPOINTS below.
 */
export class FmpProvider implements FinancialsProvider {
  readonly id = 'fmp';
  readonly configured: boolean;

  private static readonly ENDPOINTS = {
    search: (q: string) => `/api/v3/search?query=${encodeURIComponent(q)}&limit=5`,
    profile: (s: string) => `/api/v3/profile/${encodeURIComponent(s)}`,
    quote: (s: string) => `/api/v3/quote/${encodeURIComponent(s)}`,
    income: (s: string, p: string, n: number) =>
      `/api/v3/income-statement/${encodeURIComponent(s)}?period=${p}&limit=${n}`,
    cashFlow: (s: string, p: string, n: number) =>
      `/api/v3/cash-flow-statement/${encodeURIComponent(s)}?period=${p}&limit=${n}`,
    balance: (s: string, p: string, n: number) =>
      `/api/v3/balance-sheet-statement/${encodeURIComponent(s)}?period=${p}&limit=${n}`,
    executives: (s: string) => `/api/v3/key-executives/${encodeURIComponent(s)}`,
    insider: (s: string, n: number) =>
      `/api/v4/insider-trading?symbol=${encodeURIComponent(s)}&page=0&limit=${n}`,
    transcriptList: (s: string) =>
      `/api/v4/earning_call_transcript?symbol=${encodeURIComponent(s)}`,
    transcript: (s: string, year: number, quarter: number) =>
      `/api/v3/earning_call_transcript/${encodeURIComponent(s)}?year=${year}&quarter=${quarter}`,
  };

  constructor(private readonly apiKey = config.FMP_API_KEY, private readonly baseUrl = config.FMP_BASE_URL) {
    this.configured = Boolean(apiKey);
  }

  private async get<T>(path: string): Promise<T | null> {
    if (!this.configured) return null;
    const sep = path.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${path}${sep}apikey=${encodeURIComponent(this.apiKey)}`;
    try {
      return await fetchJson<T>(url, { timeoutMs: 20_000 });
    } catch (err) {
      // Never log the URL — it carries the API key.
      logger.warn({ provider: 'fmp', path: path.split('?')[0], err: (err as Error).message }, 'FMP request failed');
      return null;
    }
  }

  async resolve(query: string): Promise<CompanyRef | null> {
    const hits = await this.get<FmpSearchHit[]>(FmpProvider.ENDPOINTS.search(query));
    const first = hits?.[0];
    if (!first?.symbol) return null;
    return {
      ticker: first.symbol.toUpperCase(),
      name: first.name ?? first.symbol,
      exchange: first.exchangeShortName,
    };
  }

  async getProfile(ref: CompanyRef): Promise<CompanyProfile | null> {
    const rows = await this.get<FmpProfile[]>(FmpProvider.ENDPOINTS.profile(ref.ticker));
    const p = rows?.[0];
    if (!p) return null;
    return {
      description: p.description ?? null,
      sector: p.sector ?? null,
      industry: p.industry ?? null,
      employees: num(p.fullTimeEmployees),
      country: p.country ?? null,
      ipoDate: p.ipoDate ?? null,
      website: p.website ?? null,
    };
  }

  async getQuote(ref: CompanyRef): Promise<PricePoint | null> {
    const rows = await this.get<FmpProfile[]>(FmpProvider.ENDPOINTS.quote(ref.ticker));
    const q = rows?.[0];
    if (!q) return null;
    return {
      price: num(q.price),
      marketCap: num(q.marketCap ?? q.mktCap),
      changePercent: num(
        typeof q.changesPercentage === 'string'
          ? q.changesPercentage.replace(/[()%]/g, '')
          : q.changesPercentage,
      ),
      currency: q.currency ?? 'USD',
    };
  }

  private async getStatements(
    ref: CompanyRef,
    period: 'annual' | 'quarter',
    limit: number,
  ): Promise<FinancialPeriod[] | null> {
    const [income, cash, balance] = await Promise.all([
      this.get<FmpIncome[]>(FmpProvider.ENDPOINTS.income(ref.ticker, period, limit)),
      this.get<FmpCashFlow[]>(FmpProvider.ENDPOINTS.cashFlow(ref.ticker, period, limit)),
      this.get<FmpBalance[]>(FmpProvider.ENDPOINTS.balance(ref.ticker, period, limit)),
    ]);

    if (!income?.length) return null;

    const cashByDate = new Map((cash ?? []).map((r) => [r.date ?? '', r]));
    const balByDate = new Map((balance ?? []).map((r) => [r.date ?? '', r]));

    return income.map((row) => {
      const date = row.date ?? '';
      const label =
        period === 'annual'
          ? `FY${row.calendarYear ?? date.slice(0, 4)}`
          : `${row.calendarYear ?? date.slice(0, 4)}-${row.period ?? ''}`;

      const p = emptyPeriod(label, date);
      p.revenue = num(row.revenue);
      p.grossProfit = num(row.grossProfit);
      p.operatingIncome = num(row.operatingIncome);
      p.netIncome = num(row.netIncome);
      p.sharesDiluted = num(row.weightedAverageShsOutDil);

      const cf = cashByDate.get(date);
      p.operatingCashFlow = num(cf?.operatingCashFlow);
      p.capex = num(cf?.capitalExpenditure);
      p.freeCashFlow = num(cf?.freeCashFlow);

      const bs = balByDate.get(date);
      p.cash = num(bs?.cashAndCashEquivalents ?? bs?.cashAndShortTermInvestments);
      p.totalDebt = num(bs?.totalDebt);

      return p;
    });
  }

  getAnnualFinancials(ref: CompanyRef, limit: number): Promise<FinancialPeriod[] | null> {
    return this.getStatements(ref, 'annual', limit);
  }

  getQuarterlyFinancials(ref: CompanyRef, limit: number): Promise<FinancialPeriod[] | null> {
    return this.getStatements(ref, 'quarter', limit);
  }

  async getExecutives(ref: CompanyRef): Promise<Executive[] | null> {
    const rows = await this.get<FmpExecutive[]>(FmpProvider.ENDPOINTS.executives(ref.ticker));
    if (!rows) return null;
    return rows
      .filter((r) => r.name)
      .map((r) => ({
        name: r.name ?? '',
        title: r.title ?? '',
        since: r.titleSince ? String(r.titleSince).slice(0, 10) : undefined,
        payTotal: num(r.pay),
      }));
  }

  /**
   * Which calls FMP has for this company, newest first.
   * The v4 endpoint returns bare tuples of [quarter, year, date].
   */
  async listTranscripts(ref: CompanyRef): Promise<TranscriptRef[] | null> {
    const listed = await this.get<[number, number, string][]>(
      FmpProvider.ENDPOINTS.transcriptList(ref.ticker),
    );
    if (!listed) return null;

    return listed
      .filter((r) => Array.isArray(r) && r.length >= 2)
      .map((r) => ({ year: Number(r[1]), quarter: Number(r[0]), date: r[2] ?? '', cached: false }))
      .filter((r) => Number.isFinite(r.year) && Number.isFinite(r.quarter))
      .sort((a, b) => b.year - a.year || b.quarter - a.quarter);
  }

  /**
   * FMP splits transcripts across two endpoints: v4 lists which quarters exist,
   * v3 returns one quarter's text. When no quarter is requested we resolve the
   * newest from the list rather than guessing the current calendar quarter,
   * which is wrong for most of the year given reporting lag.
   */
  async getTranscript(
    ref: CompanyRef,
    opts: { year?: number; quarter?: number } = {},
  ): Promise<Transcript | null> {
    let { year, quarter } = opts;

    if (year === undefined || quarter === undefined) {
      const available = await this.listTranscripts(ref);
      const newest = available?.[0];
      if (!newest) return null;
      quarter = newest.quarter;
      year = newest.year;
    }

    const rows = await this.get<
      { symbol?: string; quarter?: number; year?: number; date?: string; content?: string }[]
    >(FmpProvider.ENDPOINTS.transcript(ref.ticker, year, quarter));

    const t = rows?.[0];
    if (!t?.content) return null;

    return {
      ticker: ref.ticker,
      period: `Q${t.quarter ?? quarter} ${t.year ?? year}`,
      date: t.date ?? '',
      content: t.content,
      source: 'Financial Modeling Prep',
      fiscalYear: t.year ?? year,
      fiscalQuarter: t.quarter ?? quarter,
      kind: 'call_transcript',
    };
  }

  async getInsiderTrades(ref: CompanyRef, limit: number): Promise<InsiderTrade[] | null> {
    const rows = await this.get<FmpInsider[]>(FmpProvider.ENDPOINTS.insider(ref.ticker, limit));
    if (!rows) return null;
    return rows.slice(0, limit).map((r) => {
      const shares = num(r.securitiesTransacted);
      const price = num(r.price);
      return {
        filedAt: r.transactionDate ?? r.filingDate ?? '',
        insiderName: r.reportingName ?? 'unknown',
        insiderTitle: r.typeOfOwner ?? '',
        direction: normalizeInsiderDirection(r),
        shares,
        value: shares !== null && price !== null ? shares * price : null,
      };
    });
  }
}
