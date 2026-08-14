import type { FinancialPeriod, FinancialTrend } from '../types.js';

const ratio = (num: number | null, den: number | null): number | null =>
  num === null || den === null || den === 0 ? null : num / den;

/**
 * Compound annual growth rate between the oldest and newest period in a window.
 * Returns null when either endpoint is missing or non-positive, because a CAGR
 * across a sign change is meaningless rather than merely imprecise.
 */
export function cagr(newest: number | null, oldest: number | null, years: number): number | null {
  if (newest === null || oldest === null) return null;
  if (oldest <= 0 || newest <= 0 || years <= 0) return null;
  return (newest / oldest) ** (1 / years) - 1;
}

/**
 * Turn a list of periods into the series an investor actually reads: growth,
 * margins, and free cash flow conversion.
 *
 * `periods` must be newest-first. FCF is derived as operating cash flow minus
 * capex when the provider does not supply it; capex is normalized to a positive
 * magnitude first, since providers disagree on its sign.
 */
export function buildTrend(periods: FinancialPeriod[]): FinancialTrend {
  const normalized = periods.map((p) => {
    const capex = p.capex === null ? null : Math.abs(p.capex);
    const freeCashFlow =
      p.freeCashFlow ??
      (p.operatingCashFlow !== null && capex !== null ? p.operatingCashFlow - capex : null);
    return { ...p, capex, freeCashFlow };
  });

  // YoY growth compares each period to the one after it (older) in the array.
  const revenueGrowthYoY = normalized.map((p, i) => {
    const prev = normalized[i + 1];
    if (!prev || p.revenue === null || prev.revenue === null || prev.revenue === 0) return null;
    // Growth off a negative base is not interpretable.
    if (prev.revenue < 0) return null;
    return (p.revenue - prev.revenue) / prev.revenue;
  });

  const newest = normalized[0];
  const at = (i: number) => normalized[i]?.revenue ?? null;

  return {
    periods: normalized,
    revenueGrowthYoY,
    grossMargin: normalized.map((p) => ratio(p.grossProfit, p.revenue)),
    operatingMargin: normalized.map((p) => ratio(p.operatingIncome, p.revenue)),
    netMargin: normalized.map((p) => ratio(p.netIncome, p.revenue)),
    fcfMargin: normalized.map((p) => ratio(p.freeCashFlow, p.revenue)),
    revenueCagr3y: normalized.length >= 4 ? cagr(newest?.revenue ?? null, at(3), 3) : null,
    revenueCagr5y: normalized.length >= 6 ? cagr(newest?.revenue ?? null, at(5), 5) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* formatting helpers used in WhatsApp messages                                */
/* -------------------------------------------------------------------------- */

export function formatMoney(value: number | null, currency = 'USD'): string {
  if (value === null) return 'n/a';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const sym = currency === 'USD' ? '$' : `${currency} `;
  if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${sym}${abs.toFixed(2)}`;
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return 'n/a';
  return `${(value * 100).toFixed(digits)}%`;
}
