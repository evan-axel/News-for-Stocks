import type { Repo } from '../db/repo.js';
import { normalizeCompanyName } from '../db/repo.js';
import type { CompanyRef, RawItem } from '../types.js';

/**
 * Press releases almost always stamp the ticker next to the company name:
 * "Acme Corp (NASDAQ: ACME) today announced...". That is the single most
 * reliable signal available, so it is tried before anything fuzzy.
 */
const EXCHANGE_TICKER_RE =
  /\(\s*(?:NASDAQ|NYSE(?:\s+(?:American|Arca))?|NYSE\s*MKT|AMEX|OTC(?:QB|QX|MKTS|BB)?|TSXV?|TSX-V|CSE|NEO|LSE|ASX|CBOE)\s*[:\-–]\s*([A-Z][A-Z0-9.\-]{0,6})\s*\)/g;

/** Same, but without the wrapping parentheses. */
const BARE_EXCHANGE_TICKER_RE =
  /\b(?:NASDAQ|NYSE|AMEX|OTCQB|OTCQX|OTCMKTS|TSX|TSXV|CSE|LSE|ASX)\s*[:\-–]\s*([A-Z][A-Z0-9.\-]{0,6})\b/g;

/** Cashtags, as used on social and in some newsletters. */
const CASHTAG_RE = /\$([A-Z]{1,6})\b/g;

/** Tokens that look like tickers but never are. */
const TICKER_STOPWORDS = new Set([
  'CEO', 'CFO', 'COO', 'CTO', 'USA', 'USD', 'GAAP', 'EPS', 'IPO', 'SEC', 'FDA', 'ESG',
  'AI', 'IT', 'PR', 'US', 'UK', 'EU', 'Q1', 'Q2', 'Q3', 'Q4', 'FY', 'LLC', 'INC', 'LTD',
  'ETF', 'NAV', 'IRS', 'FTC', 'DOJ', 'NYSE', 'API', 'CAGR', 'EBIT',
]);

function collect(re: RegExp, text: string): string[] {
  const out: string[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[1]?.toUpperCase();
    if (t && !TICKER_STOPWORDS.has(t)) out.push(t);
  }
  return out;
}

/** All ticker candidates in a blob of text, most reliable pattern first. */
export function extractTickers(text: string): string[] {
  const ordered = [
    ...collect(EXCHANGE_TICKER_RE, text),
    ...collect(BARE_EXCHANGE_TICKER_RE, text),
    ...collect(CASHTAG_RE, text),
  ];
  return [...new Set(ordered)];
}

/* -------------------------------------------------------------------------- */
/* name resolution                                                             */
/* -------------------------------------------------------------------------- */

interface IndexEntry {
  ticker: string;
  cik: string;
  name: string;
  normalized: string;
}

let nameIndex: IndexEntry[] | null = null;
let nameIndexLoadedAt = 0;
const NAME_INDEX_TTL_MS = 60 * 60 * 1000;

function loadNameIndex(repo: Repo): IndexEntry[] {
  if (nameIndex && Date.now() - nameIndexLoadedAt < NAME_INDEX_TTL_MS) return nameIndex;
  nameIndex = repo
    .allTickerNames()
    // Single-word normalized names like "x" produce garbage substring hits.
    .filter((e) => e.normalized.length >= 4);
  nameIndexLoadedAt = Date.now();
  return nameIndex;
}

export function invalidateNameIndex(): void {
  nameIndex = null;
}

/**
 * Find a company by name inside a headline.
 *
 * Requires the indexed name to appear as a whole-token run in the normalized
 * headline, and prefers the longest such match — otherwise "Apple Hospitality"
 * and "Apple Inc." both hit on a story about either one.
 */
export function resolveByName(text: string, repo: Repo): CompanyRef | null {
  const normalizedText = ` ${normalizeCompanyName(text)} `;
  if (normalizedText.trim().length < 4) return null;

  let best: IndexEntry | null = null;
  for (const entry of loadNameIndex(repo)) {
    if (!normalizedText.includes(` ${entry.normalized} `)) continue;
    if (!best || entry.normalized.length > best.normalized.length) best = entry;
  }

  return best ? { ticker: best.ticker, name: best.name, cik: best.cik } : null;
}

/**
 * Work out which company an item is about.
 *
 * Order matters: a ticker the source itself declared beats one we scraped out of
 * the text, which beats a name we fuzzy-matched. Returns null rather than
 * guessing when nothing is confident — an alert with the wrong company attached
 * is worse than one with no company attached.
 */
export function resolveCompany(item: RawItem, repo: Repo): CompanyRef | null {
  for (const declared of item.declaredTickers ?? []) {
    const hit = repo.lookupTicker(declared);
    if (hit) return { ticker: hit.ticker, name: hit.name, cik: hit.cik };
    // Trust the source even when the ticker is not in the SEC index (foreign issuers).
    return { ticker: declared.toUpperCase(), name: item.title.slice(0, 80) };
  }

  const searchText = `${item.title}\n${item.body.slice(0, 2000)}`;
  for (const ticker of extractTickers(searchText)) {
    const hit = repo.lookupTicker(ticker);
    if (hit) return { ticker: hit.ticker, name: hit.name, cik: hit.cik };
  }

  // Only the headline for name matching — body text mentions competitors,
  // customers and advisors, none of which are the subject of the story.
  return resolveByName(item.title, repo);
}
