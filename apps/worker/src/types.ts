/** A single item pulled from a news feed, wire, or filing index. */
export interface RawItem {
  /** Stable identity for dedupe: canonical URL when available, else source id + guid. */
  externalId: string;
  sourceId: string;
  sourceName: string;
  /** 'newswire' | 'news' | 'filing' — drives how much we trust it and how we phrase it. */
  sourceKind: SourceKind;
  title: string;
  url: string;
  /** Plain-text body or summary. May be empty for index-only feeds. */
  body: string;
  publishedAt: Date;
  /** Tickers the source itself asserted, if any (e.g. EDGAR filings). */
  declaredTickers?: string[];
}

export type SourceKind = 'newswire' | 'news' | 'filing';

/** A keyword the user watches, with its expansion set. */
export interface Keyword {
  id: number;
  /** Canonical label shown in alerts, e.g. "strategic review". */
  term: string;
  /** Phrases that also count as a hit for this keyword. */
  synonyms: string[];
  /** Phrases that veto a hit even when the term matched (noise suppression). */
  negations: string[];
  enabled: boolean;
  createdAt: Date;
}

/** A keyword firing on a specific item. */
export interface Match {
  keyword: Keyword;
  /** The literal phrase that matched. */
  matchedPhrase: string;
  /** ~200 chars of surrounding text, for the alert. */
  snippet: string;
}

/** Resolved identity of the company an item is about. */
export interface CompanyRef {
  ticker: string;
  name: string;
  /** Zero-padded 10-digit SEC CIK, when known. */
  cik?: string;
  exchange?: string;
}

export interface PricePoint {
  price: number | null;
  marketCap: number | null;
  changePercent: number | null;
  currency: string;
}

/** One fiscal period of financials, normalized across providers. */
export interface FinancialPeriod {
  /** 'FY2024' or '2024-Q3'. */
  label: string;
  endDate: string;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  totalDebt: number | null;
  cash: number | null;
  sharesDiluted: number | null;
}

/** Derived series the LLM actually reasons over: growth, margins, FCF trend. */
export interface FinancialTrend {
  periods: FinancialPeriod[];
  revenueGrowthYoY: (number | null)[];
  grossMargin: (number | null)[];
  operatingMargin: (number | null)[];
  netMargin: (number | null)[];
  fcfMargin: (number | null)[];
  revenueCagr3y: number | null;
  revenueCagr5y: number | null;
}

export interface Executive {
  name: string;
  title: string;
  since?: string;
  payTotal?: number | null;
}

export interface InsiderTrade {
  filedAt: string;
  insiderName: string;
  insiderTitle: string;
  /** 'buy' | 'sell' | 'other' — normalized from provider transaction codes. */
  direction: 'buy' | 'sell' | 'other';
  shares: number | null;
  value: number | null;
}

/** Everything we know about a company, assembled for the LLM and the user. */
export interface CompanyContext {
  ref: CompanyRef;
  profile: {
    description: string | null;
    sector: string | null;
    industry: string | null;
    employees: number | null;
    country: string | null;
    ipoDate: string | null;
    website: string | null;
  };
  quote: PricePoint;
  annual: FinancialTrend | null;
  quarterly: FinancialTrend | null;
  executives: Executive[];
  insiderTrades: InsiderTrade[];
  /** Which providers actually answered, so we can be honest about gaps. */
  sources: string[];
  /** Non-fatal problems worth surfacing ("FMP returned no insider data"). */
  warnings: string[];
  fetchedAt: Date;
}

export type FilterKind = 'sector' | 'industry' | 'market_cap' | 'exchange' | 'country' | 'ticker';

/**
 * The "which companies" axis of an alert rule. Keywords say what happened;
 * filters say whose news you actually want to hear about.
 */
export interface Filter {
  id: number;
  kind: FilterKind;
  /** Text kinds only: matched case-insensitively as a substring. */
  value: string | null;
  /** market_cap only: inclusive USD bounds; null means unbounded. */
  minValue: number | null;
  maxValue: number | null;
  mode: 'include' | 'exclude';
  enabled: boolean;
  createdAt: Date;
}

/** An earnings call transcript, or as much of one as the provider serves. */
export interface Transcript {
  ticker: string;
  /** e.g. "Q3 2025". */
  period: string;
  date: string;
  /** Full text; may be long — chunk before sending anywhere. */
  content: string;
  source: string;
}

/** A stored, possibly-sent alert. */
export interface Alert {
  id: number;
  externalId: string;
  ticker: string | null;
  companyName: string | null;
  keywordTerm: string;
  matchedPhrase: string;
  title: string;
  url: string;
  sourceName: string;
  sourceKind: SourceKind;
  snippet: string;
  /** The composed WhatsApp text. */
  message: string | null;
  publishedAt: Date;
  createdAt: Date;
  sentAt: Date | null;
  status: 'pending' | 'sent' | 'suppressed' | 'failed';
  error: string | null;
}
