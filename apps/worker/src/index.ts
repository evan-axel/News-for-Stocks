import { config, describeCapabilities } from './config.js';
import { closeDb, getDb } from './db/index.js';
import { Repo } from './db/repo.js';
import { logger } from './logger.js';
import { runScan } from './pipeline/scan.js';
import { createServer } from './server.js';
import { ensureTickerIndex } from './scripts/lib/ticker-index.js';

async function main(): Promise<void> {
  getDb(); // applies migrations
  const repo = new Repo();

  logger.info({ capabilities: describeCapabilities() }, 'starting News-for-Stocks worker');

  if (repo.listKeywords().length === 0) {
    logger.warn('no keywords configured — run `npm run seed` to load the default pack');
  }

  // Non-blocking: the SEC ticker index only affects company resolution quality,
  // so a slow or failed refresh must not delay the server coming up.
  void ensureTickerIndex(repo).catch((err) =>
    logger.warn({ err: (err as Error).message }, 'ticker index refresh failed'),
  );

  const app = createServer(repo);
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'HTTP server listening');
    logger.info(
      `Twilio webhook URL: ${config.PUBLIC_BASE_URL.replace(/\/$/, '')}/webhooks/twilio`,
    );
  });

  let scanning = false;
  const tick = async (): Promise<void> => {
    // Skip rather than queue: a scan that outruns the interval means the next
    // one would only duplicate work already in flight.
    if (scanning) {
      logger.warn('previous scan still running — skipping this tick');
      return;
    }
    scanning = true;
    try {
      await runScan(repo);
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'scan failed');
    } finally {
      scanning = false;
    }
  };

  const interval = setInterval(() => void tick(), config.SCAN_INTERVAL_SECONDS * 1000);
  void tick(); // run one immediately so a fresh deploy isn't silent

  // Trim the dedupe ledger daily so the database doesn't grow without bound.
  const prune = setInterval(
    () => {
      const removed = repo.pruneSeenItems(30);
      if (removed) logger.info({ removed }, 'pruned old seen_items');
    },
    24 * 60 * 60 * 1000,
  );

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    clearInterval(interval);
    clearInterval(prune);
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err: (err as Error).message, stack: (err as Error).stack }, 'fatal startup error');
  process.exit(1);
});
