import type Anthropic from '@anthropic-ai/sdk';
import type { Repo } from '../db/repo.js';
import { formatMoney, formatPercent } from '../enrich/derive.js';
import {
  getCompanyContext,
  getTranscript,
  listTranscripts,
  resolveCompanyRef,
} from '../enrich/company.js';
import { logger } from '../logger.js';
import { describeFilter, MARKET_CAP_PRESETS } from '../matching/filters.js';
import { fetchText } from '../sources/http.js';
import { fetchRecentFilings } from '../sources/sec.js';
import { parseFeed } from '../sources/rss.js';
import type { FilterKind, Transcript } from '../types.js';
import { renderCompanyContext } from './render.js';

/**
 * Tool surface for the WhatsApp agent.
 *
 * Every tool returns plain text rather than JSON: the model reads it directly,
 * and text keeps tool results small enough that a long conversation doesn't
 * blow the context budget on machine-readable punctuation.
 */
export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_company_snapshot',
    description:
      'Full picture of one public company: market cap, price, sector/industry, business description, historical annual and quarterly financials (revenue, growth, margins, free cash flow), named executives, and recent insider transactions. Call this whenever the user names a company or ticker and wants to know about it. Accepts a ticker or a company name.',
    input_schema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Ticker or company name, e.g. "AAPL" or "Apple".' },
        refresh: {
          type: 'boolean',
          description: 'Bypass the 30-minute cache and refetch. Use when the user asks for live/current data.',
        },
      },
      required: ['company'],
    },
  },
  {
    name: 'list_transcripts',
    description:
      'List which earnings calls are available for a company, newest first, with the fiscal year and quarter of each. Call this when the user asks about a call other than the most recent one, or asks which calls you can see, or wants to compare quarters — then pass the year and quarter to get_transcript or search_transcript.',
    input_schema: {
      type: 'object',
      properties: { company: { type: 'string', description: 'Ticker or company name.' } },
      required: ['company'],
    },
  },
  {
    name: 'get_transcript',
    description:
      "Fetch an earnings call transcript. Returns the header plus the opening section — for anything specific, use search_transcript instead of reading the whole thing. Omit year and quarter for the most recent call. Use when the user asks what management said, guidance commentary, or anything about a specific call.",
    input_schema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Ticker or company name.' },
        year: { type: 'integer', description: 'Fiscal year. Omit for the most recent call.' },
        quarter: { type: 'integer', description: 'Fiscal quarter 1-4. Omit for the most recent call.' },
      },
      required: ['company'],
    },
  },
  {
    name: 'search_transcript',
    description:
      'Search inside a transcript for a word or phrase and return the matching passages with surrounding context. This is the efficient way to answer a specific question about a call — prefer it over fetching the whole transcript. Omit year and quarter to search the most recent call.',
    input_schema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Ticker or company name.' },
        query: { type: 'string', description: 'Word or phrase to find, e.g. "margin" or "guidance".' },
        year: { type: 'integer', description: 'Fiscal year. Omit for the most recent call.' },
        quarter: { type: 'integer', description: 'Fiscal quarter 1-4. Omit for the most recent call.' },
      },
      required: ['company', 'query'],
    },
  },
  {
    name: 'get_recent_filings',
    description:
      'List a company\'s recent SEC filings (8-K, 10-Q, 10-K, DEF 14A, Form 4, etc.) with dates and direct links. Use for "what have they filed lately" or to find a specific document.',
    input_schema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Ticker or company name.' },
        forms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional filter, e.g. ["8-K","10-Q"].',
        },
        limit: { type: 'integer', description: 'Max filings to return (default 15).' },
      },
      required: ['company'],
    },
  },
  {
    name: 'search_news',
    description:
      'Search recent news across news sites and press-release wires for any query — a company, a theme, an industry, or a phrase. Use when the user asks what is happening with something, or for news outside the alerts already sent.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search, e.g. "Acme Corp strategic review".' },
        limit: { type: 'integer', description: 'Max headlines to return (default 10).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_recent_alerts',
    description:
      'The alerts this system has already sent, newest first, optionally filtered to one company. Use for "what did you send me about X" or "what have I missed today".',
    input_schema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Optional ticker to filter by.' },
        limit: { type: 'integer', description: 'Max alerts (default 10).' },
      },
    },
  },
  {
    name: 'get_watch_config',
    description:
      'Show what is currently being watched: the keyword list and the company filters (industry, sector, market-cap band, etc.), plus the watchlist. Call this before changing anything so you can tell the user what is already set.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'update_watch_config',
    description:
      'Change what gets alerted on. Use to add or remove a keyword, add or remove a company filter (industry, sector, market cap band, exchange, country, specific ticker), or manage the watchlist. Confirm destructive removals with the user first.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'add_keyword',
            'remove_keyword',
            'add_filter',
            'remove_filter',
            'add_to_watchlist',
            'remove_from_watchlist',
          ],
        },
        term: { type: 'string', description: 'For keyword actions: the keyword phrase.' },
        synonyms: {
          type: 'array',
          items: { type: 'string' },
          description: 'For add_keyword: other phrasings that should also trigger it.',
        },
        filter_kind: {
          type: 'string',
          enum: ['sector', 'industry', 'market_cap', 'exchange', 'country', 'ticker'],
          description: 'For add_filter.',
        },
        filter_value: {
          type: 'string',
          description:
            'For add_filter with a text kind: the value, e.g. "Biotechnology". For market_cap: a preset name (nano, micro, small, mid, large, mega).',
        },
        min_market_cap: { type: 'number', description: 'For add_filter market_cap: USD lower bound.' },
        max_market_cap: { type: 'number', description: 'For add_filter market_cap: USD upper bound.' },
        mode: {
          type: 'string',
          enum: ['include', 'exclude'],
          description: 'For add_filter. Default include.',
        },
        filter_id: { type: 'integer', description: 'For remove_filter: the id from get_watch_config.' },
        ticker: { type: 'string', description: 'For watchlist actions.' },
      },
      required: ['action'],
    },
  },
];

type ToolInput = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const int = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined;

/**
 * Execute one tool call. Never throws: a thrown error inside the agent loop
 * would abandon the user's question, so failures come back as readable text the
 * model can relay or work around.
 */
export async function executeTool(
  name: string,
  input: ToolInput,
  repo: Repo,
): Promise<{ text: string; isError: boolean }> {
  try {
    const text = await dispatch(name, input, repo);
    return { text, isError: false };
  } catch (err) {
    const message = (err as Error).message;
    logger.error({ tool: name, err: message }, 'tool execution failed');
    return { text: `Tool "${name}" failed: ${message}`, isError: true };
  }
}

async function dispatch(name: string, input: ToolInput, repo: Repo): Promise<string> {
  switch (name) {
    case 'get_company_snapshot':
      return companySnapshot(input, repo);
    case 'list_transcripts':
      return availableTranscripts(input, repo);
    case 'get_transcript':
      return fetchTranscript(input, repo);
    case 'search_transcript':
      return searchTranscript(input, repo);
    case 'get_recent_filings':
      return recentFilings(input, repo);
    case 'search_news':
      return searchNews(input);
    case 'get_recent_alerts':
      return recentAlerts(input, repo);
    case 'get_watch_config':
      return watchConfig(repo);
    case 'update_watch_config':
      return updateWatchConfig(input, repo);
    default:
      return `Unknown tool "${name}".`;
  }
}

/* -------------------------------------------------------------------------- */
/* implementations                                                             */
/* -------------------------------------------------------------------------- */

async function resolveOrExplain(company: string, repo: Repo) {
  const ref = await resolveCompanyRef(company, repo);
  if (!ref) {
    throw new Error(
      `Could not identify a public company from "${company}". Ask the user for the ticker.`,
    );
  }
  return ref;
}

async function companySnapshot(input: ToolInput, repo: Repo): Promise<string> {
  const company = str(input.company);
  if (!company) return 'Missing required "company".';
  const ref = await resolveOrExplain(company, repo);
  const ctx = await getCompanyContext(ref, repo, { fresh: input.refresh === true });
  return renderCompanyContext(ctx);
}

/** Pull optional year/quarter off a tool input. */
function periodOpts(input: ToolInput): { year?: number; quarter?: number } {
  const opts: { year?: number; quarter?: number } = {};
  const y = int(input.year);
  const q = int(input.quarter);
  if (y !== undefined) opts.year = y;
  if (q !== undefined) opts.quarter = q;
  return opts;
}

const NO_TRANSCRIPT_HELP =
  'Transcripts need a provider that serves them — FMP, Fiscal.ai, or an MCP transcripts server. Without one, only the SEC earnings press release is available, and only for US filers.';

/** Label used everywhere a release stands in for a real call. */
function describeKind(t: Transcript): string {
  return t.kind === 'earnings_release'
    ? 'EARNINGS PRESS RELEASE (not a call transcript — no Q&A section)'
    : 'earnings call transcript';
}

async function availableTranscripts(input: ToolInput, repo: Repo): Promise<string> {
  const company = str(input.company);
  if (!company) return 'Missing required "company".';
  const ref = await resolveOrExplain(company, repo);

  const list = await listTranscripts(ref, repo);
  if (!list.length) return `No earnings calls listed for ${ref.ticker}. ${NO_TRANSCRIPT_HELP}`;

  return [
    `Earnings calls available for ${ref.name} (${ref.ticker}), newest first:`,
    ...list
      .slice(0, 20)
      .map((r) => `  Q${r.quarter} ${r.year}${r.date ? ` — ${r.date}` : ''}${r.cached ? '  [already downloaded]' : ''}`),
  ].join('\n');
}

async function fetchTranscript(input: ToolInput, repo: Repo): Promise<string> {
  const company = str(input.company);
  if (!company) return 'Missing required "company".';
  const ref = await resolveOrExplain(company, repo);

  const transcript = await getTranscript(ref, repo, periodOpts(input));
  if (!transcript) return `No transcript available for ${ref.ticker}. ${NO_TRANSCRIPT_HELP}`;

  const head = transcript.content.slice(0, 4000);
  return [
    `${describeKind(transcript)}: ${ref.name} (${ref.ticker}) — ${transcript.period}${
      transcript.date ? `, ${transcript.date}` : ''
    }`,
    `Source: ${transcript.source} · ${transcript.content.length.toLocaleString()} characters total`,
    '',
    head,
    transcript.content.length > head.length
      ? `\n[…truncated. Use search_transcript with a query to pull specific passages — it searches the full text.]`
      : '',
  ].join('\n');
}

async function searchTranscript(input: ToolInput, repo: Repo): Promise<string> {
  const company = str(input.company);
  const query = str(input.query);
  if (!company || !query) return 'Missing required "company" or "query".';

  const ref = await resolveOrExplain(company, repo);

  const transcript = await getTranscript(ref, repo, periodOpts(input));
  if (!transcript) return `No transcript available for ${ref.ticker} to search. ${NO_TRANSCRIPT_HELP}`;

  const needle = query.toLowerCase();
  const haystack = transcript.content;
  const hits: string[] = [];
  let from = 0;

  while (hits.length < 6) {
    const idx = haystack.toLowerCase().indexOf(needle, from);
    if (idx === -1) break;
    const start = Math.max(0, idx - 400);
    const end = Math.min(haystack.length, idx + needle.length + 600);
    hits.push(`…${haystack.slice(start, end).trim()}…`);
    from = end;
  }

  if (hits.length === 0) {
    return `"${query}" does not appear in the ${transcript.period} ${describeKind(transcript)} for ${ref.ticker}.`;
  }

  return [
    `${hits.length} passage(s) mentioning "${query}" in ${ref.ticker} ${transcript.period} (${describeKind(transcript)}):`,
    '',
    ...hits.map((h, i) => `[${i + 1}] ${h}`),
  ].join('\n\n');
}

async function recentFilings(input: ToolInput, repo: Repo): Promise<string> {
  const company = str(input.company);
  if (!company) return 'Missing required "company".';
  const ref = await resolveOrExplain(company, repo);
  if (!ref.cik) return `No SEC CIK known for ${ref.ticker} — it may not be a US registrant.`;

  const forms = Array.isArray(input.forms)
    ? (input.forms as unknown[]).filter((f): f is string => typeof f === 'string')
    : undefined;

  const filings = await fetchRecentFilings(ref.cik, {
    limit: int(input.limit) ?? 15,
    ...(forms?.length ? { forms } : {}),
  });

  if (!filings.length) return `No recent filings found for ${ref.ticker}.`;

  return [
    `Recent SEC filings for ${ref.name} (${ref.ticker}):`,
    ...filings.map(
      (f) => `${f.filedAt}  ${f.form.padEnd(8)} ${f.description || '(no description)'}\n  ${f.url}`,
    ),
  ].join('\n');
}

async function searchNews(input: ToolInput): Promise<string> {
  const query = str(input.query);
  if (!query) return 'Missing required "query".';
  const limit = int(input.limit) ?? 10;

  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetchText(url, { timeoutMs: 20_000 });
  const items = parseFeed({
    xml: res.body,
    sourceId: 'chat-news-search',
    sourceName: 'News search',
    sourceKind: 'news',
  }).slice(0, limit);

  if (!items.length) return `No recent news found for "${query}".`;

  return [
    `Recent news for "${query}":`,
    ...items.map((i) => `${i.publishedAt.toISOString().slice(0, 10)}  ${i.title}\n  ${i.url}`),
  ].join('\n');
}

function recentAlerts(input: ToolInput, repo: Repo): string {
  const ticker = str(input.company);
  const alerts = repo.listAlerts({
    limit: int(input.limit) ?? 10,
    ...(ticker ? { ticker: ticker.toUpperCase() } : {}),
  });

  if (!alerts.length) return ticker ? `No alerts sent for ${ticker}.` : 'No alerts sent yet.';

  return [
    `Alerts sent (newest first):`,
    ...alerts.map(
      (a) =>
        `${a.publishedAt.toISOString().slice(0, 10)}  [${a.keywordTerm}] ${
          a.ticker ?? 'unidentified'
        } — ${a.title}\n  status=${a.status}  ${a.url}`,
    ),
  ].join('\n');
}

function watchConfig(repo: Repo): string {
  const keywords = repo.listKeywords();
  const filters = repo.listFilters();
  const watchlist = repo.listWatchlist();

  const kw = keywords.length
    ? keywords
        .map(
          (k) =>
            `  ${k.enabled ? '✓' : '✗'} ${k.term}${
              k.synonyms.length ? ` (+${k.synonyms.length} variants)` : ''
            }`,
        )
        .join('\n')
    : '  (none)';

  const fl = filters.length
    ? filters
        .map((f) => `  [${f.id}] ${f.enabled ? '✓' : '✗'} ${f.mode}: ${describeFilter(f)}`)
        .join('\n')
    : '  (none — all companies pass)';

  const wl = watchlist.length ? watchlist.map((w) => w.ticker).join(', ') : '(empty)';

  return [
    `Keywords (what triggers an alert):`,
    kw,
    '',
    `Company filters (whose news gets through):`,
    fl,
    '',
    `Watchlist: ${wl}`,
  ].join('\n');
}

function updateWatchConfig(input: ToolInput, repo: Repo): string {
  const action = str(input.action);

  switch (action) {
    case 'add_keyword': {
      const term = str(input.term);
      if (!term) return 'add_keyword needs "term".';
      const synonyms = Array.isArray(input.synonyms)
        ? (input.synonyms as unknown[]).filter((s): s is string => typeof s === 'string')
        : [];
      const kw = repo.upsertKeyword({ term, synonyms });
      return `Now watching "${kw.term}"${synonyms.length ? ` plus ${synonyms.length} variant(s)` : ''}.`;
    }

    case 'remove_keyword': {
      const term = str(input.term);
      if (!term) return 'remove_keyword needs "term".';
      return repo.deleteKeyword(term)
        ? `Stopped watching "${term}".`
        : `No keyword "${term}" was set.`;
    }

    case 'add_filter': {
      const kind = str(input.filter_kind) as FilterKind | undefined;
      if (!kind) return 'add_filter needs "filter_kind".';
      const mode = str(input.mode) === 'exclude' ? 'exclude' : 'include';

      if (kind === 'market_cap') {
        const preset = str(input.filter_value)?.toLowerCase();
        const bounds = preset ? MARKET_CAP_PRESETS[preset] : undefined;
        const min = bounds ? bounds.min : (input.min_market_cap as number | undefined) ?? null;
        const max = bounds ? bounds.max : (input.max_market_cap as number | undefined) ?? null;
        if (min === null && max === null) {
          return `market_cap filter needs a preset (${Object.keys(MARKET_CAP_PRESETS).join(', ')}) or explicit bounds.`;
        }
        const f = repo.addFilter({ kind, minValue: min, maxValue: max, mode });
        return `Added filter [${f.id}] ${mode}: ${describeFilter(f)}.`;
      }

      const value = str(input.filter_value);
      if (!value) return `add_filter with kind "${kind}" needs "filter_value".`;
      const f = repo.addFilter({ kind, value, mode });
      return `Added filter [${f.id}] ${mode}: ${describeFilter(f)}.`;
    }

    case 'remove_filter': {
      const id = int(input.filter_id);
      if (id === undefined) return 'remove_filter needs "filter_id".';
      return repo.deleteFilter(id) ? `Removed filter ${id}.` : `No filter with id ${id}.`;
    }

    case 'add_to_watchlist': {
      const ticker = str(input.ticker);
      if (!ticker) return 'add_to_watchlist needs "ticker".';
      repo.addToWatchlist(ticker, null);
      return `${ticker.toUpperCase()} added to the watchlist.`;
    }

    case 'remove_from_watchlist': {
      const ticker = str(input.ticker);
      if (!ticker) return 'remove_from_watchlist needs "ticker".';
      return repo.removeFromWatchlist(ticker)
        ? `${ticker.toUpperCase()} removed from the watchlist.`
        : `${ticker.toUpperCase()} was not on the watchlist.`;
    }

    default:
      return `Unknown action "${action}".`;
  }
}

/** Exposed for the dashboard's "explain this company" view. */
export function summarizeQuote(marketCap: number | null, growth: number | null): string {
  return `${formatMoney(marketCap)} cap · ${formatPercent(growth)} rev growth`;
}
