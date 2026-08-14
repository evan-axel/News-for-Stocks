/**
 * Run a single scan and print a per-source report.
 *
 * This is the tool for verifying feed URLs after deploying: any source showing
 * an error or a persistent zero item count needs its URL refreshed in
 * sources/feed-source.ts.
 */
import { closeDb, getDb } from '../db/index.js';
import { Repo } from '../db/repo.js';
import { logger } from '../logger.js';
import { runScan } from '../pipeline/scan.js';

async function main(): Promise<void> {
  getDb();
  const repo = new Repo();

  const summary = await runScan(repo);

  const health = repo.listSourceHealth();
  const rows = health.map((h) => ({
    source: String(h.source_id),
    items: Number(h.items_last_run ?? 0),
    failures: Number(h.consecutive_failures ?? 0),
    lastError: h.last_error ? String(h.last_error).slice(0, 80) : '',
  }));

  // eslint-disable-next-line no-console -- this script's whole purpose is the report
  console.table(rows);
  logger.info(summary, 'scan summary');

  const dead = rows.filter((r) => r.failures > 0);
  if (dead.length) {
    logger.warn(
      { dead: dead.map((d) => d.source) },
      'these sources failed — check their URLs in sources/feed-source.ts',
    );
  }

  closeDb();
}

main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'scan-once failed');
  process.exit(1);
});
