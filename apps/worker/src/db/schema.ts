/**
 * Schema is applied as a list of idempotent migrations. Each entry runs once and
 * is recorded in `_migrations`, so deploying a new version never loses state.
 */
export interface Migration {
  id: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: '001_initial',
    sql: `
      CREATE TABLE IF NOT EXISTS keywords (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        term        TEXT NOT NULL UNIQUE,
        synonyms    TEXT NOT NULL DEFAULT '[]',
        negations   TEXT NOT NULL DEFAULT '[]',
        enabled     INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Dedupe ledger. An item is processed at most once, ever.
      CREATE TABLE IF NOT EXISTS seen_items (
        external_id   TEXT PRIMARY KEY,
        source_id     TEXT NOT NULL,
        first_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_seen_items_first_seen ON seen_items(first_seen_at);

      CREATE TABLE IF NOT EXISTS alerts (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id    TEXT NOT NULL,
        ticker         TEXT,
        company_name   TEXT,
        keyword_term   TEXT NOT NULL,
        matched_phrase TEXT NOT NULL,
        title          TEXT NOT NULL,
        url            TEXT NOT NULL,
        source_name    TEXT NOT NULL,
        source_kind    TEXT NOT NULL,
        snippet        TEXT NOT NULL DEFAULT '',
        message        TEXT,
        published_at   TEXT NOT NULL,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        sent_at        TEXT,
        status         TEXT NOT NULL DEFAULT 'pending',
        error          TEXT,
        UNIQUE(external_id, keyword_term)
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_ticker  ON alerts(ticker);
      CREATE INDEX IF NOT EXISTS idx_alerts_status  ON alerts(status);

      CREATE TABLE IF NOT EXISTS watchlist (
        ticker    TEXT PRIMARY KEY,
        name      TEXT,
        added_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Cached CompanyContext payloads so repeated questions about the same
      -- ticker do not re-bill the data provider.
      CREATE TABLE IF NOT EXISTS company_cache (
        ticker     TEXT PRIMARY KEY,
        payload    TEXT NOT NULL,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Rolling WhatsApp conversation history, one row per turn.
      CREATE TABLE IF NOT EXISTS conversation (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        wa_id      TEXT NOT NULL,
        role       TEXT NOT NULL,
        content    TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_conversation_wa ON conversation(wa_id, id DESC);

      CREATE TABLE IF NOT EXISTS source_health (
        source_id            TEXT PRIMARY KEY,
        last_ok_at           TEXT,
        last_error           TEXT,
        last_error_at        TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        items_last_run       INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS kv (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    id: '002_ticker_index',
    sql: `
      -- Local mirror of SEC company_tickers.json for name -> ticker resolution.
      CREATE TABLE IF NOT EXISTS ticker_index (
        ticker         TEXT PRIMARY KEY,
        cik            TEXT NOT NULL,
        name           TEXT NOT NULL,
        normalized_name TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ticker_index_norm ON ticker_index(normalized_name);
    `,
  },
  {
    id: '003_filters',
    sql: `
      -- The "which companies" axis, independent of the "what happened" axis.
      -- An alert fires when a keyword matches AND the resolved company passes
      -- the filter set. Within one kind, any include-filter matching is enough
      -- (OR); across kinds, every kind that has include-filters must be
      -- satisfied (AND). Any matching exclude-filter vetoes outright.
      CREATE TABLE IF NOT EXISTS filters (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        -- 'sector' | 'industry' | 'market_cap' | 'exchange' | 'country' | 'ticker'
        kind       TEXT NOT NULL,
        -- For text kinds: the value to match (case-insensitive substring).
        value      TEXT,
        -- For market_cap: inclusive bounds in USD. NULL means unbounded.
        min_value  REAL,
        max_value  REAL,
        -- 'include' keeps only matching companies; 'exclude' drops them.
        mode       TEXT NOT NULL DEFAULT 'include',
        enabled    INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_filters_kind ON filters(kind, enabled);
    `,
  },
  {
    id: '004_outbox',
    sql: `
      -- WhatsApp only allows freeform messages within 24h of the user's last
      -- inbound message. Alerts composed outside that window are parked here and
      -- flushed the moment the user texts back, so nothing is silently dropped.
      CREATE TABLE IF NOT EXISTS outbox (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient    TEXT NOT NULL,
        body         TEXT NOT NULL,
        alert_id     INTEGER,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        delivered_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(recipient, delivered_at);
    `,
  },
];
