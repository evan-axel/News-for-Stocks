import type {
  CompanyRef,
  Executive,
  FinancialPeriod,
  InsiderTrade,
  PricePoint,
  Transcript,
  TranscriptRef,
} from '../types.js';

export interface CompanyProfile {
  description: string | null;
  sector: string | null;
  industry: string | null;
  employees: number | null;
  country: string | null;
  ipoDate: string | null;
  website: string | null;
}

/**
 * Every financial-data vendor is behind this interface, so swapping FMP for
 * Fiscal.ai (or adding a second provider as a fallback) is a config change
 * rather than a rewrite. Each method may return null to mean "I don't serve
 * this" — the orchestrator then tries the next provider in the chain.
 */
export interface FinancialsProvider {
  readonly id: string;
  /** Cheap check so the orchestrator can skip unconfigured providers. */
  readonly configured: boolean;

  resolve?(query: string): Promise<CompanyRef | null>;
  getProfile?(ref: CompanyRef): Promise<CompanyProfile | null>;
  getQuote?(ref: CompanyRef): Promise<PricePoint | null>;
  /** Newest period first. */
  getAnnualFinancials?(ref: CompanyRef, limit: number): Promise<FinancialPeriod[] | null>;
  getQuarterlyFinancials?(ref: CompanyRef, limit: number): Promise<FinancialPeriod[] | null>;
  getExecutives?(ref: CompanyRef): Promise<Executive[] | null>;
  getInsiderTrades?(ref: CompanyRef, limit: number): Promise<InsiderTrade[] | null>;
  /** Most recent earnings call transcript, or a specific quarter when given. */
  getTranscript?(
    ref: CompanyRef,
    opts?: { year?: number; quarter?: number },
  ): Promise<Transcript | null>;
  /** Which calls exist, newest first — lets the user pick a quarter by name. */
  listTranscripts?(ref: CompanyRef): Promise<TranscriptRef[] | null>;
}

export function emptyPeriod(label: string, endDate: string): FinancialPeriod {
  return {
    label,
    endDate,
    revenue: null,
    grossProfit: null,
    operatingIncome: null,
    netIncome: null,
    operatingCashFlow: null,
    capex: null,
    freeCashFlow: null,
    totalDebt: null,
    cash: null,
    sharesDiluted: null,
  };
}

/** Coerce provider values that may arrive as strings, nulls, or NaN. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
