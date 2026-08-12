import { config } from '../config.js';
import { logger } from '../logger.js';
import { fetchJson, fetchText } from './http.js';
import { secLimiter } from './limiter.js';
import { parseFeed, stripHtml } from './rss.js';
import type { Source } from './types.js';
import type { RawItem } from '../types.js';

const SEC_HOST = 'https://www.sec.gov';
const EFTS_HOST = 'https://efts.sec.gov';

/* -------------------------------------------------------------------------- */
/* EDGAR full-text search                                                      */
/* -------------------------------------------------------------------------- */

interface EftsHit {
  _id: string;
  _source: {
    ciks?: string[];
    display_names?: string[];
    file_type?: string;
    root_form?: string;
    file_date?: string;
    adsh?: string;
    file_description?: string;
  };
}

interface EftsResponse {
  hits?: { total?: { value?: number }; hits?: EftsHit[] };
}

/** "Apple Inc. (AAPL)  (CIK 0000320193)" -> { name, ticker } */
export function parseDisplayName(display: string): { name: string; ticker: string | null } {
  const withoutCik = display.replace(/\s*\(CIK\s+\d+\)\s*$/i, '').trim();
  const tickerMatch = withoutCik.match(/\(([A-Z][A-Z0-9.\-]{0,6})\)\s*$/);
  if (tickerMatch?.[1]) {
    return { name: withoutCik.slice(0, tickerMatch.index).trim(), ticker: tickerMatch[1] };
  }
  return { name: withoutCik, ticker: null };
}

/**
 * Build the public URL for a filing document.
 * _id looks like "0000320193-24-000123:aapl-20240101.htm".
 */
export function filingUrl(cik: string, id: string): string {
  const [accession, doc] = id.split(':');
  const accessionNoDashes = (accession ?? '').replace(/-/g, '');
  const cikTrimmed = String(Number(cik)); // EDGAR archive paths use the unpadded CIK
  const base = `${SEC_HOST}/Archives/edgar/data/${cikTrimmed}/${accessionNoDashes}`;
  return doc ? `${base}/${doc}` : `${base}/`;
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * One source per keyword, hitting EDGAR's full-text search over recent filings.
 * This is the piece that catches a phrase buried in an 8-K exhibit that never
 * makes it into a press release.
 */
export function createSecFullTextSource(
  term: string,
  opts: { forms?: string[]; lookbackDays?: number } = {},
): Source {
  const forms = opts.forms ?? ['8-K', '6-K', 'S-1', '424B4', 'DEF 14A', '10-Q', '10-K'];
  const lookbackDays = opts.lookbackDays ?? 2;

  return {
    id: `sec-fts:${term.replace(/\s+/g, '-')}`,
    name: `SEC filings: "${term}"`,
    kind: 'filing',
    async fetch(): Promise<RawItem[]> {
      const params = new URLSearchParams({
        q: `"${term}"`,
        forms: forms.join(','),
        startdt: isoDaysAgo(lookbackDays),
        enddt: isoDaysAgo(0),
      });
      const url = `${EFTS_HOST}/LATEST/search-index?${params.toString()}`;

      const data = await secLimiter.run(() =>
        fetchJson<EftsResponse>(url, { userAgent: config.SEC_USER_AGENT, timeoutMs: 25_000 }),
      );

      const hits = data.hits?.hits ?? [];
      const items: RawItem[] = [];

      for (const hit of hits) {
        const src = hit._source ?? {};
        const cik = src.ciks?.[0];
        if (!cik) continue;

        const display = src.display_names?.[0] ?? '';
        const { name, ticker } = parseDisplayName(display);
        const form = src.root_form ?? src.file_type ?? 'filing';
        const url = filingUrl(cik, hit._id);
        const filedAt = src.file_date ? new Date(`${src.file_date}T12:00:00Z`) : new Date();

        items.push({
          externalId: url,
          sourceId: `sec-fts:${term}`,
          sourceName: 'SEC EDGAR',
          sourceKind: 'filing',
          title: `${form}: ${name || 'Unknown filer'}${src.file_description ? ` — ${src.file_description}` : ''}`,
          url,
          // The FTS index does not return the matched text, only that the phrase
          // is present. We assert it here so the matcher has something to hit;
          // the snippet is then enriched by fetching the document if needed.
          body: `${name} filed a ${form} containing the phrase "${term}".`,
          publishedAt: filedAt,
          declaredTickers: ticker ? [ticker] : [],
        });
      }

      return items;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* EDGAR current filings feed                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The rolling "latest filings" Atom feed for a form type. Useful as a
 * keyword-independent firehose: catches material events even when the phrasing
 * is not one we watch for.
 */
export function createSecCurrentFilingsSource(formType = '8-K', count = 100): Source {
  const url =
    `${SEC_HOST}/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(formType)}` +
    `&company=&dateb=&owner=include&count=${count}&output=atom`;

  return {
    id: `sec-current:${formType}`,
    name: `SEC current ${formType} filings`,
    kind: 'filing',
    async fetch(): Promise<RawItem[]> {
      const res = await secLimiter.run(() =>
        fetchText(url, { userAgent: config.SEC_USER_AGENT, timeoutMs: 25_000 }),
      );
      return parseFeed({
        xml: res.body,
        sourceId: `sec-current:${formType}`,
        sourceName: 'SEC EDGAR',
        sourceKind: 'filing',
      });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Filing document text                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Fetch and flatten a filing document so the matcher can find the real snippet.
 * Capped because a 10-K can be tens of megabytes and we only need context.
 */
export async function fetchFilingText(url: string, maxChars = 200_000): Promise<string> {
  try {
    const res = await secLimiter.run(() =>
      fetchText(url, { userAgent: config.SEC_USER_AGENT, timeoutMs: 30_000, retries: 1 }),
    );
    return stripHtml(res.body).slice(0, maxChars);
  } catch (err) {
    logger.debug({ url, err: (err as Error).message }, 'could not fetch filing text');
    return '';
  }
}

/* -------------------------------------------------------------------------- */
/* Recent filings for one company                                              */
/* -------------------------------------------------------------------------- */

export interface FilingSummary {
  form: string;
  filedAt: string;
  reportDate: string;
  description: string;
  url: string;
}

interface SubmissionsResponse {
  name?: string;
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      reportDate?: string[];
      form?: string[];
      primaryDocument?: string[];
      primaryDocDescription?: string[];
    };
  };
}

/**
 * EDGAR's per-company submissions feed: the last ~1000 filings as parallel
 * arrays. Used by the chat agent to answer "what has this company filed lately".
 */
export async function fetchRecentFilings(
  cik: string,
  opts: { limit?: number; forms?: string[] } = {},
): Promise<FilingSummary[]> {
  const padded = cik.padStart(10, '0');
  const limit = opts.limit ?? 15;

  const data = await secLimiter.run(() =>
    fetchJson<SubmissionsResponse>(`https://data.sec.gov/submissions/CIK${padded}.json`, {
      userAgent: config.SEC_USER_AGENT,
      timeoutMs: 30_000,
    }),
  );

  const r = data.filings?.recent;
  if (!r?.form) return [];

  const cikTrimmed = String(Number(padded));
  const out: FilingSummary[] = [];

  for (let i = 0; i < r.form.length && out.length < limit; i++) {
    const form = r.form[i];
    if (!form) continue;
    if (opts.forms?.length && !opts.forms.includes(form)) continue;

    const accession = (r.accessionNumber?.[i] ?? '').replace(/-/g, '');
    const doc = r.primaryDocument?.[i] ?? '';
    out.push({
      form,
      filedAt: r.filingDate?.[i] ?? '',
      reportDate: r.reportDate?.[i] ?? '',
      description: r.primaryDocDescription?.[i] ?? '',
      url: accession
        ? `${SEC_HOST}/Archives/edgar/data/${cikTrimmed}/${accession}/${doc}`
        : `${SEC_HOST}/cgi-bin/browse-edgar?action=getcompany&CIK=${padded}`,
    });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Company ticker index                                                        */
/* -------------------------------------------------------------------------- */

interface CompanyTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

/**
 * SEC publishes the authoritative ticker -> CIK -> name mapping for every US
 * registrant as a single JSON file. We mirror it locally to resolve company
 * names found in headlines, with no API key and no rate concerns.
 */
export async function fetchCompanyTickerIndex(): Promise<
  { ticker: string; cik: string; name: string }[]
> {
  const data = await secLimiter.run(() =>
    fetchJson<Record<string, CompanyTickerEntry>>(`${SEC_HOST}/files/company_tickers.json`, {
      userAgent: config.SEC_USER_AGENT,
      timeoutMs: 45_000,
    }),
  );

  return Object.values(data)
    .filter((e) => e && e.ticker && e.title)
    .map((e) => ({
      ticker: e.ticker.toUpperCase(),
      cik: String(e.cik_str).padStart(10, '0'),
      name: e.title,
    }));
}
