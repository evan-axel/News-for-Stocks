import type { Database } from 'better-sqlite3';
import { getDb } from './index.js';
import type {
  Alert,
  CompanyContext,
  Filter,
  FilterKind,
  Keyword,
  SourceKind,
  Transcript,
} from '../types.js';

/* -------------------------------------------------------------------------- */
/* row shapes                                                                  */
/* -------------------------------------------------------------------------- */

interface KeywordRow {
  id: number;
  term: string;
  synonyms: string;
  negations: string;
  match_term: number;
  enabled: number;
  created_at: string;
}

interface AlertRow {
  id: number;
  external_id: string;
  ticker: string | null;
  company_name: string | null;
  keyword_term: string;
  matched_phrase: string;
  title: string;
  url: string;
  source_name: string;
  source_kind: string;
  snippet: string;
  message: string | null;
  published_at: string;
  created_at: string;
  sent_at: string | null;
  status: string;
  error: string | null;
}

interface FilterRow {
  id: number;
  kind: string;
  value: string | null;
  min_value: number | null;
  max_value: number | null;
  mode: string;
  enabled: number;
  created_at: string;
}

function toFilter(row: FilterRow): Filter {
  return {
    id: row.id,
    kind: row.kind as FilterKind,
    value: row.value,
    minValue: row.min_value,
    maxValue: row.max_value,
    mode: row.mode === 'exclude' ? 'exclude' : 'include',
    enabled: row.enabled === 1,
    createdAt: new Date(`${row.created_at}Z`),
  };
}

interface TranscriptRow {
  ticker: string;
  period: string;
  fiscal_year: number | null;
  fiscal_quarter: number | null;
  event_date: string;
  kind: string;
  content: string;
  source: string;
  fetched_at: string;
}

function toTranscript(row: TranscriptRow): Transcript {
  return {
    ticker: row.ticker,
    period: row.period,
    date: row.event_date,
    content: row.content,
    source: row.source,
    fiscalYear: row.fiscal_year,
    fiscalQuarter: row.fiscal_quarter,
    kind: row.kind === 'earnings_release' ? 'earnings_release' : 'call_transcript',
  };
}

function toKeyword(row: KeywordRow): Keyword {
  return {
    id: row.id,
    term: row.term,
    synonyms: JSON.parse(row.synonyms) as string[],
    negations: JSON.parse(row.negations) as string[],
    // Older rows predate the column; treat a missing value as "match it".
    matchTerm: row.match_term === undefined || row.match_term === 1,
    enabled: row.enabled === 1,
    createdAt: new Date(`${row.created_at}Z`),
  };
}

function toAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    externalId: row.external_id,
    ticker: row.ticker,
    companyName: row.company_name,
    keywordTerm: row.keyword_term,
    matchedPhrase: row.matched_phrase,
    title: row.title,
    url: row.url,
    sourceName: row.source_name,
    sourceKind: row.source_kind as SourceKind,
    snippet: row.snippet,
    message: row.message,
    publishedAt: new Date(row.published_at),
    createdAt: new Date(`${row.created_at}Z`),
    sentAt: row.sent_at ? new Date(`${row.sent_at}Z`) : null,
    status: row.status as Alert['status'],
    error: row.error,
  };
}

/* -------------------------------------------------------------------------- */
/* repository                                                                  */
/* -------------------------------------------------------------------------- */

export class Repo {
  constructor(private readonly db: Database = getDb()) {}

  /* --- keywords --------------------------------------------------------- */

  listKeywords(): Keyword[] {
    return this.db
      .prepare<[], KeywordRow>('SELECT * FROM keywords ORDER BY term')
      .all()
      .map(toKeyword);
  }

  listEnabledKeywords(): Keyword[] {
    return this.db
      .prepare<[], KeywordRow>('SELECT * FROM keywords WHERE enabled = 1 ORDER BY term')
      .all()
      .map(toKeyword);
  }

  /** Insert or replace a keyword's expansion set. Returns the stored keyword. */
  upsertKeyword(input: {
    term: string;
    synonyms?: string[];
    negations?: string[];
    matchTerm?: boolean;
    enabled?: boolean;
  }): Keyword {
    const term = input.term.trim().toLowerCase();
    this.db
      .prepare(
        `INSERT INTO keywords (term, synonyms, negations, match_term, enabled)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(term) DO UPDATE SET
           synonyms   = excluded.synonyms,
           negations  = excluded.negations,
           match_term = excluded.match_term,
           enabled    = excluded.enabled`,
      )
      .run(
        term,
        JSON.stringify(input.synonyms ?? []),
        JSON.stringify(input.negations ?? []),
        input.matchTerm === false ? 0 : 1,
        input.enabled === false ? 0 : 1,
      );
    const row = this.db
      .prepare<[string], KeywordRow>('SELECT * FROM keywords WHERE term = ?')
      .get(term);
    if (!row) throw new Error(`keyword upsert failed for "${term}"`);
    return toKeyword(row);
  }

  setKeywordEnabled(term: string, enabled: boolean): boolean {
    const res = this.db
      .prepare('UPDATE keywords SET enabled = ? WHERE term = ?')
      .run(enabled ? 1 : 0, term.trim().toLowerCase());
    return res.changes > 0;
  }

  deleteKeyword(term: string): boolean {
    const res = this.db
      .prepare('DELETE FROM keywords WHERE term = ?')
      .run(term.trim().toLowerCase());
    return res.changes > 0;
  }

  /* --- filters ---------------------------------------------------------- */

  listFilters(): Filter[] {
    return this.db
      .prepare<[], FilterRow>('SELECT * FROM filters ORDER BY kind, id')
      .all()
      .map(toFilter);
  }

  addFilter(input: {
    kind: FilterKind;
    value?: string | null;
    minValue?: number | null;
    maxValue?: number | null;
    mode?: 'include' | 'exclude';
  }): Filter {
    const res = this.db
      .prepare(
        `INSERT INTO filters (kind, value, min_value, max_value, mode) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.kind,
        input.value?.trim() ?? null,
        input.minValue ?? null,
        input.maxValue ?? null,
        input.mode ?? 'include',
      );
    const row = this.db
      .prepare<[number], FilterRow>('SELECT * FROM filters WHERE id = ?')
      .get(Number(res.lastInsertRowid));
    if (!row) throw new Error('filter insert failed');
    return toFilter(row);
  }

  setFilterEnabled(id: number, enabled: boolean): boolean {
    return (
      this.db.prepare('UPDATE filters SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
        .changes > 0
    );
  }

  deleteFilter(id: number): boolean {
    return this.db.prepare('DELETE FROM filters WHERE id = ?').run(id).changes > 0;
  }

  /* --- dedupe ----------------------------------------------------------- */

  /** True if this is the first time we have seen the item. Records it either way. */
  markSeenIfNew(externalId: string, sourceId: string): boolean {
    const res = this.db
      .prepare('INSERT OR IGNORE INTO seen_items (external_id, source_id) VALUES (?, ?)')
      .run(externalId, sourceId);
    return res.changes > 0;
  }

  pruneSeenItems(olderThanDays = 30): number {
    return this.db
      .prepare(`DELETE FROM seen_items WHERE first_seen_at < datetime('now', ?)`)
      .run(`-${olderThanDays} days`).changes;
  }

  /* --- alerts ----------------------------------------------------------- */

  /** Returns the new alert id, or null when this (item, keyword) pair already exists. */
  insertAlert(input: {
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
    publishedAt: Date;
  }): number | null {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO alerts
          (external_id, ticker, company_name, keyword_term, matched_phrase,
           title, url, source_name, source_kind, snippet, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.externalId,
        input.ticker,
        input.companyName,
        input.keywordTerm,
        input.matchedPhrase,
        input.title,
        input.url,
        input.sourceName,
        input.sourceKind,
        input.snippet,
        input.publishedAt.toISOString(),
      );
    return res.changes > 0 ? Number(res.lastInsertRowid) : null;
  }

  getAlert(id: number): Alert | null {
    const row = this.db.prepare<[number], AlertRow>('SELECT * FROM alerts WHERE id = ?').get(id);
    return row ? toAlert(row) : null;
  }

  markAlertSent(id: number, message: string): void {
    this.db
      .prepare(`UPDATE alerts SET status='sent', sent_at=datetime('now'), message=? WHERE id=?`)
      .run(message, id);
  }

  markAlertFailed(id: number, error: string, message: string | null): void {
    this.db
      .prepare(`UPDATE alerts SET status='failed', error=?, message=? WHERE id=?`)
      .run(error.slice(0, 500), message, id);
  }

  markAlertSuppressed(id: number, reason: string): void {
    this.db.prepare(`UPDATE alerts SET status='suppressed', error=? WHERE id=?`).run(reason, id);
  }

  listAlerts(opts: { limit?: number; ticker?: string; status?: string } = {}): Alert[] {
    const limit = Math.min(opts.limit ?? 50, 200);
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (opts.ticker) {
      clauses.push('ticker = ?');
      params.push(opts.ticker.toUpperCase());
    }
    if (opts.status) {
      clauses.push('status = ?');
      params.push(opts.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(limit);
    return this.db
      .prepare<unknown[], AlertRow>(
        `SELECT * FROM alerts ${where} ORDER BY published_at DESC, id DESC LIMIT ?`,
      )
      .all(...params)
      .map(toAlert);
  }

  /** Used by the rate limiter to avoid a runaway keyword flooding the phone. */
  countAlertsSentSince(since: Date): number {
    const row = this.db
      .prepare<[string], { n: number }>(
        `SELECT COUNT(*) AS n FROM alerts WHERE status='sent' AND sent_at >= ?`,
      )
      .get(since.toISOString().replace('T', ' ').slice(0, 19));
    return row?.n ?? 0;
  }

  /* --- watchlist -------------------------------------------------------- */

  listWatchlist(): { ticker: string; name: string | null; addedAt: string }[] {
    return this.db
      .prepare<[], { ticker: string; name: string | null; added_at: string }>(
        'SELECT * FROM watchlist ORDER BY ticker',
      )
      .all()
      .map((r) => ({ ticker: r.ticker, name: r.name, addedAt: r.added_at }));
  }

  addToWatchlist(ticker: string, name: string | null): void {
    this.db
      .prepare(
        `INSERT INTO watchlist (ticker, name) VALUES (?, ?)
         ON CONFLICT(ticker) DO UPDATE SET name = COALESCE(excluded.name, watchlist.name)`,
      )
      .run(ticker.toUpperCase(), name);
  }

  removeFromWatchlist(ticker: string): boolean {
    return this.db.prepare('DELETE FROM watchlist WHERE ticker = ?').run(ticker.toUpperCase())
      .changes > 0;
  }

  /* --- company cache ---------------------------------------------------- */

  getCachedCompany(ticker: string, maxAgeMinutes: number): CompanyContext | null {
    const row = this.db
      .prepare<[string, string], { payload: string }>(
        `SELECT payload FROM company_cache WHERE ticker = ? AND fetched_at >= datetime('now', ?)`,
      )
      .get(ticker.toUpperCase(), `-${maxAgeMinutes} minutes`);
    if (!row) return null;
    const parsed = JSON.parse(row.payload) as CompanyContext;
    parsed.fetchedAt = new Date(parsed.fetchedAt);
    return parsed;
  }

  setCachedCompany(ticker: string, ctx: CompanyContext): void {
    this.db
      .prepare(
        `INSERT INTO company_cache (ticker, payload, fetched_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(ticker) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at`,
      )
      .run(ticker.toUpperCase(), JSON.stringify(ctx));
  }

  /* --- transcripts ------------------------------------------------------ */

  cacheTranscript(t: Transcript): void {
    this.db
      .prepare(
        `INSERT INTO transcripts
           (ticker, period, fiscal_year, fiscal_quarter, event_date, kind, content, source, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(ticker, period) DO UPDATE SET
           content=excluded.content, source=excluded.source, fetched_at=excluded.fetched_at,
           event_date=excluded.event_date, kind=excluded.kind`,
      )
      .run(
        t.ticker.toUpperCase(),
        t.period,
        t.fiscalYear ?? null,
        t.fiscalQuarter ?? null,
        t.date ?? '',
        t.kind ?? 'call_transcript',
        t.content,
        t.source,
      );
  }

  /**
   * Read a cached transcript. With no year/quarter, returns the newest held —
   * ordering by fiscal period rather than fetch time, so pulling an old quarter
   * doesn't make it look like the latest.
   */
  getCachedTranscript(
    ticker: string,
    opts: { year?: number; quarter?: number } = {},
  ): Transcript | null {
    const base = `SELECT * FROM transcripts WHERE ticker = ?`;
    const row =
      opts.year !== undefined && opts.quarter !== undefined
        ? this.db
            .prepare<[string, number, number], TranscriptRow>(
              `${base} AND fiscal_year = ? AND fiscal_quarter = ?`,
            )
            .get(ticker.toUpperCase(), opts.year, opts.quarter)
        : this.db
            .prepare<[string], TranscriptRow>(
              `${base} ORDER BY fiscal_year DESC, fiscal_quarter DESC, fetched_at DESC LIMIT 1`,
            )
            .get(ticker.toUpperCase());

    return row ? toTranscript(row) : null;
  }

  listCachedTranscripts(ticker: string): Transcript[] {
    return this.db
      .prepare<[string], TranscriptRow>(
        `SELECT * FROM transcripts WHERE ticker = ?
         ORDER BY fiscal_year DESC, fiscal_quarter DESC`,
      )
      .all(ticker.toUpperCase())
      .map(toTranscript);
  }

  /* --- conversation ----------------------------------------------------- */

  appendTurn(waId: string, role: 'user' | 'assistant', content: string): void {
    this.db
      .prepare('INSERT INTO conversation (wa_id, role, content) VALUES (?, ?, ?)')
      .run(waId, role, content);
  }

  /** Most recent turns in chronological order. */
  recentTurns(waId: string, limit = 20): { role: 'user' | 'assistant'; content: string }[] {
    return this.db
      .prepare<[string, number], { role: string; content: string }>(
        'SELECT role, content FROM conversation WHERE wa_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(waId, limit)
      .reverse()
      .map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));
  }

  clearConversation(waId: string): void {
    this.db.prepare('DELETE FROM conversation WHERE wa_id = ?').run(waId);
  }

  /* --- outbox ----------------------------------------------------------- */

  queueOutbound(recipient: string, body: string, alertId: number | null): number {
    const res = this.db
      .prepare('INSERT INTO outbox (recipient, body, alert_id) VALUES (?, ?, ?)')
      .run(recipient, body, alertId);
    return Number(res.lastInsertRowid);
  }

  pendingOutbound(recipient: string, limit = 20): { id: number; body: string; alertId: number | null }[] {
    return this.db
      .prepare<[string, number], { id: number; body: string; alert_id: number | null }>(
        `SELECT id, body, alert_id FROM outbox
         WHERE recipient = ? AND delivered_at IS NULL
         ORDER BY id LIMIT ?`,
      )
      .all(recipient, limit)
      .map((r) => ({ id: r.id, body: r.body, alertId: r.alert_id }));
  }

  markOutboundDelivered(id: number): void {
    this.db.prepare(`UPDATE outbox SET delivered_at = datetime('now') WHERE id = ?`).run(id);
  }

  countPendingOutbound(recipient: string): number {
    return (
      this.db
        .prepare<[string], { n: number }>(
          'SELECT COUNT(*) AS n FROM outbox WHERE recipient = ? AND delivered_at IS NULL',
        )
        .get(recipient)?.n ?? 0
    );
  }

  /* --- source health ---------------------------------------------------- */

  recordSourceOk(sourceId: string, items: number): void {
    this.db
      .prepare(
        `INSERT INTO source_health (source_id, last_ok_at, consecutive_failures, items_last_run)
         VALUES (?, datetime('now'), 0, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           last_ok_at=datetime('now'), consecutive_failures=0, items_last_run=excluded.items_last_run`,
      )
      .run(sourceId, items);
  }

  recordSourceError(sourceId: string, error: string): void {
    this.db
      .prepare(
        `INSERT INTO source_health (source_id, last_error, last_error_at, consecutive_failures)
         VALUES (?, ?, datetime('now'), 1)
         ON CONFLICT(source_id) DO UPDATE SET
           last_error=excluded.last_error,
           last_error_at=datetime('now'),
           consecutive_failures=source_health.consecutive_failures + 1`,
      )
      .run(sourceId, error.slice(0, 300));
  }

  listSourceHealth(): Record<string, unknown>[] {
    return this.db
      .prepare<[], Record<string, unknown>>('SELECT * FROM source_health ORDER BY source_id')
      .all();
  }

  /* --- kv --------------------------------------------------------------- */

  kvGet(key: string): string | null {
    return (
      this.db.prepare<[string], { value: string }>('SELECT value FROM kv WHERE key = ?').get(key)
        ?.value ?? null
    );
  }

  kvSet(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO kv (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  /* --- ticker index ----------------------------------------------------- */

  replaceTickerIndex(entries: { ticker: string; cik: string; name: string }[]): number {
    const insert = this.db.prepare(
      'INSERT OR REPLACE INTO ticker_index (ticker, cik, name, normalized_name) VALUES (?, ?, ?, ?)',
    );
    const run = this.db.transaction((rows: typeof entries) => {
      this.db.prepare('DELETE FROM ticker_index').run();
      for (const e of rows) {
        insert.run(e.ticker.toUpperCase(), e.cik, e.name, normalizeCompanyName(e.name));
      }
    });
    run(entries);
    return entries.length;
  }

  tickerIndexSize(): number {
    return (
      this.db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM ticker_index').get()?.n ?? 0
    );
  }

  lookupTicker(ticker: string): { ticker: string; cik: string; name: string } | null {
    return (
      this.db
        .prepare<[string], { ticker: string; cik: string; name: string }>(
          'SELECT ticker, cik, name FROM ticker_index WHERE ticker = ?',
        )
        .get(ticker.toUpperCase()) ?? null
    );
  }

  lookupByNormalizedName(
    normalized: string,
  ): { ticker: string; cik: string; name: string } | null {
    return (
      this.db
        .prepare<[string], { ticker: string; cik: string; name: string }>(
          'SELECT ticker, cik, name FROM ticker_index WHERE normalized_name = ? LIMIT 1',
        )
        .get(normalized) ?? null
    );
  }

  /** All index rows, for in-memory fuzzy name matching. */
  allTickerNames(): { ticker: string; cik: string; name: string; normalized: string }[] {
    return this.db
      .prepare<[], { ticker: string; cik: string; name: string; normalized_name: string }>(
        'SELECT ticker, cik, name, normalized_name FROM ticker_index',
      )
      .all()
      .map((r) => ({ ticker: r.ticker, cik: r.cik, name: r.name, normalized: r.normalized_name }));
  }
}

/** Strip corporate suffixes and punctuation so "Acme Corp., Inc." == "acme". */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(
      /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|llc|lp|plc|holdings?|group|technologies|technology|international|the)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
