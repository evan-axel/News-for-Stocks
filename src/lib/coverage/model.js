// Pure data and helpers for the coverage universe. Client-safe.

export const SECTORS = [
  'Energy',
  'Materials',
  'Industrials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Health Care',
  'Financials',
  'Information Technology',
  'Communication Services',
  'Utilities',
  'Real Estate',
  'Uncategorized',
];

export const RATINGS = {
  buy: { label: 'Buy', tone: 'emerald' },
  hold: { label: 'Hold', tone: 'slate' },
  sell: { label: 'Sell', tone: 'red' },
  watch: { label: 'Watch', tone: 'indigo' },
};

export const STATUSES = {
  active: 'Active',
  monitoring: 'Monitoring',
  dropped: 'Dropped',
};

export const CATALYST_KINDS = {
  earnings: 'Earnings',
  guidance: 'Guidance',
  regulatory: 'Regulatory',
  deal: 'Deal / M&A',
  product: 'Product',
  capital: 'Capital markets',
  legal: 'Legal',
  other: 'Other',
};

/** Metrics a name can be tracked on, beyond the standard statement lines. */
export const KPI_LIBRARY = [
  { key: 'revenue', label: 'Revenue', kind: 'currency' },
  { key: 'grossMargin', label: 'Gross margin', kind: 'percent' },
  { key: 'operatingMargin', label: 'Operating margin', kind: 'percent' },
  { key: 'netMargin', label: 'Net margin', kind: 'percent' },
  { key: 'fcfMargin', label: 'FCF margin', kind: 'percent' },
  { key: 'freeCashFlow', label: 'Free cash flow', kind: 'currency' },
  { key: 'netDebt', label: 'Net debt', kind: 'currency' },
  { key: 'returnOnEquity', label: 'Return on equity', kind: 'percent' },
  { key: 'epsDiluted', label: 'Diluted EPS', kind: 'perShare' },
  { key: 'operatingCashFlow', label: 'Cash from operations', kind: 'currency' },
  { key: 'capex', label: 'Capex', kind: 'currency' },
  { key: 'stockComp', label: 'Stock-based comp', kind: 'currency' },
];

export function kpiMeta(key) {
  return KPI_LIBRARY.find((k) => k.key === key) || { key, label: key, kind: 'number' };
}

/** Compact money: 1.2B, 340.5M, 12.3k. */
export function money(value, { decimals = 1 } = {}) {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(decimals)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(decimals)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(decimals)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(decimals)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function percent(value, { decimals = 1 } = {}) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatKpi(value, kind) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (kind === 'percent') return percent(value);
  if (kind === 'currency') return money(value);
  if (kind === 'perShare') return `$${value.toFixed(2)}`;
  if (kind === 'multiple') return `${value.toFixed(1)}x`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Percentile rank of the latest value within its own history — the "relative
 * to history" read. 0 means cheapest/lowest ever observed, 1 the highest.
 */
export function percentileRank(series, value) {
  const clean = series.filter((v) => v != null && Number.isFinite(v));
  if (!clean.length || value == null || !Number.isFinite(value)) return null;
  const below = clean.filter((v) => v <= value).length;
  return below / clean.length;
}

export function median(values) {
  const clean = values.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

/** Growth between the two most recent comparable periods. */
export function yoy(periods, key) {
  if (!periods || periods.length < 2) return null;
  const latest = periods[periods.length - 1];
  const prior = periods[periods.length - 2];
  const a = latest?.values?.[key] ?? latest?.derived?.[key];
  const b = prior?.values?.[key] ?? prior?.derived?.[key];
  if (a == null || b == null || b === 0) return null;
  return (a - b) / Math.abs(b);
}
