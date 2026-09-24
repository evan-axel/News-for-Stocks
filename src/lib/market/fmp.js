import { defineProvider } from './provider';

/**
 * Financial Modeling Prep adapter. Supplies what EDGAR cannot: last price,
 * price history, street estimates and profile data.
 *
 * Every method returns the same normalized shapes the dashboard consumes, so
 * swapping this for Polygon/Tiingo/an internal feed means writing one file, not
 * touching any panel.
 */

function key() {
  return process.env['FMP_API_KEY'];
}

function base() {
  return (process.env['FMP_BASE_URL'] || 'https://financialmodelingprep.com').replace(/\/+$/, '');
}

async function get(path, params = {}) {
  const apiKey = key();
  if (!apiKey) throw new Error('FMP_API_KEY is not set.');

  const url = new URL(`${base()}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }
  url.searchParams.set('apikey', apiKey);

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (response.status === 401 || response.status === 403) {
    throw new Error('FMP rejected the API key.');
  }
  if (response.status === 429) throw new Error('FMP rate limit reached.');
  if (!response.ok) throw new Error(`FMP responded ${response.status}`);

  const data = await response.json();
  if (data && data['Error Message']) throw new Error(`FMP: ${data['Error Message']}`);
  return data;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function quote(symbol) {
  const [row] = (await get(`/api/v3/quote/${encodeURIComponent(symbol)}`)) || [];
  if (!row) return null;
  return {
    source: 'fmp',
    symbol: row.symbol,
    price: num(row.price),
    change: num(row.change),
    changePercent: num(row.changesPercentage),
    dayLow: num(row.dayLow),
    dayHigh: num(row.dayHigh),
    yearLow: num(row.yearLow),
    yearHigh: num(row.yearHigh),
    marketCap: num(row.marketCap),
    volume: num(row.volume),
    avgVolume: num(row.avgVolume),
    peRatio: num(row.pe),
    epsTtm: num(row.eps),
    sharesOutstanding: num(row.sharesOutstanding),
    asOf: row.timestamp ? new Date(row.timestamp * 1000).toISOString() : null,
  };
}

async function priceHistory(symbol, { from = '', to = '' } = {}) {
  const data = await get(`/api/v3/historical-price-full/${encodeURIComponent(symbol)}`, { from, to });
  const rows = Array.isArray(data?.historical) ? data.historical : [];
  return {
    source: 'fmp',
    symbol,
    // FMP returns newest first; every consumer here wants chronological.
    closes: rows
      .map((r) => ({ date: r.date, close: num(r.close), volume: num(r.volume) }))
      .filter((r) => r.date && r.close != null)
      .reverse(),
  };
}

async function estimates(symbol, { period = 'annual', limit = 8 } = {}) {
  const rows =
    (await get(`/api/v3/analyst-estimates/${encodeURIComponent(symbol)}`, { period, limit })) || [];
  return {
    source: 'fmp',
    symbol,
    period,
    rows: rows
      .map((r) => ({
        date: r.date,
        fy: r.date ? Number(String(r.date).slice(0, 4)) : null,
        revenue: num(r.estimatedRevenueAvg),
        revenueLow: num(r.estimatedRevenueLow),
        revenueHigh: num(r.estimatedRevenueHigh),
        eps: num(r.estimatedEpsAvg),
        epsLow: num(r.estimatedEpsLow),
        epsHigh: num(r.estimatedEpsHigh),
        ebitda: num(r.estimatedEbitdaAvg),
        analysts: num(r.numberAnalystEstimatedRevenue),
      }))
      .filter((r) => r.date)
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

async function profile(symbol) {
  const [row] = (await get(`/api/v3/profile/${encodeURIComponent(symbol)}`)) || [];
  if (!row) return null;
  return {
    source: 'fmp',
    symbol: row.symbol,
    name: row.companyName,
    sector: row.sector || '',
    industry: row.industry || '',
    exchange: row.exchangeShortName || '',
    marketCap: num(row.mktCap),
    beta: num(row.beta),
    description: row.description || '',
    cik: row.cik ? String(row.cik).padStart(10, '0') : null,
  };
}

export const fmpProvider = defineProvider({
  id: 'fmp',
  label: 'Financial Modeling Prep',
  docsUrl: 'https://site.financialmodelingprep.com/developer/docs',
  envKey: 'FMP_API_KEY',
  capabilities: ['quote', 'priceHistory', 'estimates', 'profile'],
  configured: () => Boolean(key()),
  quote,
  priceHistory,
  estimates,
  profile,
});
