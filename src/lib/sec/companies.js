import { secFetchJson, TTL, secWww } from './client';

const tickersUrl = () => `${secWww()}/files/company_tickers.json`;

export function padCik(cik) {
  return String(cik).replace(/\D/g, '').padStart(10, '0');
}

export function shortCik(cik) {
  return String(Number(String(cik).replace(/\D/g, '')));
}

let memo = null;

/**
 * SEC publishes the full ticker->CIK map as one file. It is a few hundred KB,
 * so it is fetched once a week and kept in memory thereafter.
 *
 * The published shape is an object keyed by row index:
 *   { "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }, ... }
 */
export async function loadCompanies() {
  if (memo) return memo;

  const raw = await secFetchJson(tickersUrl(), { maxAgeMs: TTL.WEEK });
  const rows = Array.isArray(raw) ? raw : Object.values(raw || {});

  memo = rows
    .map((row) => ({
      cik: padCik(row.cik_str ?? row.cik ?? ''),
      ticker: String(row.ticker || '').toUpperCase(),
      name: String(row.title || row.name || ''),
    }))
    .filter((row) => row.cik && row.cik !== '0000000000' && (row.ticker || row.name));

  return memo;
}

/**
 * Ranked company lookup by ticker or name. Exact ticker wins, then ticker
 * prefix, then name prefix, then name substring — so "AA" finds AA before
 * every company with "aa" somewhere in its name.
 */
export async function searchCompanies(query, limit = 20) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];

  const companies = await loadCompanies();
  const scored = [];

  for (const company of companies) {
    const ticker = company.ticker.toLowerCase();
    const name = company.name.toLowerCase();

    let score = null;
    if (ticker && ticker === q) score = 0;
    else if (ticker && ticker.startsWith(q)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (ticker && ticker.includes(q)) score = 4;

    if (score !== null) scored.push({ ...company, score });
  }

  scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  return scored.slice(0, limit).map(({ score, ...rest }) => rest);
}

export async function resolveCompany(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  // A bare number is treated as a CIK.
  if (/^\d{1,10}$/.test(raw)) {
    const cik = padCik(raw);
    const companies = await loadCompanies();
    return companies.find((c) => c.cik === cik) || { cik, ticker: '', name: `CIK ${cik}` };
  }

  const [match] = await searchCompanies(raw, 1);
  return match || null;
}
