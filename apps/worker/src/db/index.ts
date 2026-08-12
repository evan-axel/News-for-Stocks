import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { migrations } from './schema.js';

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;

  const dbPath = path.resolve(config.DATABASE_PATH);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  // WAL lets the HTTP handler read while the scan loop writes.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);

  const applied = new Set(
    db.prepare<[], { id: string }>('SELECT id FROM _migrations').all().map((r) => r.id),
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(migration.id);
    })();
    logger.info({ migration: migration.id }, 'applied migration');
  }

  instance = db;
  return db;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}

/** Test helper: open an in-memory database with the full schema applied. */
export function createMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT);`);
  for (const migration of migrations) db.exec(migration.sql);
  return db;
}
