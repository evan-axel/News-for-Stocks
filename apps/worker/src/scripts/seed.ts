/**
 * One-time setup: load the default keyword pack and download the SEC ticker
 * index. Safe to re-run — keywords are upserted, not duplicated.
 */
import { closeDb, getDb } from '../db/index.js';
import { Repo } from '../db/repo.js';
import { logger } from '../logger.js';
import { DEFAULT_FILTERS, DEFAULT_KEYWORDS } from '../matching/keywords.js';
import { ensureTickerIndex } from './lib/ticker-index.js';

async function main(): Promise<void> {
  getDb();
  const repo = new Repo();

  for (const seed of DEFAULT_KEYWORDS) {
    repo.upsertKeyword({
      term: seed.term,
      synonyms: seed.synonyms,
      negations: seed.negations,
      matchTerm: seed.matchTerm !== false,
    });
  }
  logger.info({ count: DEFAULT_KEYWORDS.length }, 'seeded default keywords');

  // Only seed filters into a fresh install. Re-running seed must never
  // resurrect a filter the user deliberately deleted, or duplicate one.
  if (repo.listFilters().length === 0) {
    for (const f of DEFAULT_FILTERS) {
      repo.addFilter({
        kind: f.kind,
        value: f.value ?? null,
        minValue: f.minValue ?? null,
        maxValue: f.maxValue ?? null,
        mode: f.mode,
      });
      logger.info({ filter: f.note }, 'seeded default filter');
    }
  } else {
    logger.info('filters already configured — leaving them alone');
  }

  try {
    const size = await ensureTickerIndex(repo, true);
    logger.info({ size }, 'ticker index ready');
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      'ticker index download failed — company resolution will be weaker until this succeeds. Check SEC_USER_AGENT is a real contact string.',
    );
  }

  logger.info('seed complete');
  closeDb();
}

main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'seed failed');
  process.exit(1);
});
