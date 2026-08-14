import type { Repo } from '../../db/repo.js';
import { logger } from '../../logger.js';
import { invalidateNameIndex } from '../../matching/tickers.js';
import { fetchCompanyTickerIndex } from '../../sources/sec.js';

const REFRESH_KEY = 'tickerIndex:refreshedAt';
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Keep the local SEC ticker mirror fresh.
 *
 * Company names and listings change slowly, so a weekly refresh is plenty. The
 * index is only used for resolving companies out of headlines — if the download
 * fails we keep the previous copy rather than emptying the table, because a
 * stale index resolves far more companies than an empty one.
 */
export async function ensureTickerIndex(repo: Repo, force = false): Promise<number> {
  const size = repo.tickerIndexSize();
  const last = repo.kvGet(REFRESH_KEY);
  const fresh = last && Date.now() - new Date(last).getTime() < REFRESH_INTERVAL_MS;

  if (!force && size > 0 && fresh) return size;

  logger.info({ size, force }, 'refreshing SEC ticker index');
  const entries = await fetchCompanyTickerIndex();

  if (entries.length === 0) {
    logger.warn('SEC returned an empty ticker index — keeping the existing copy');
    return size;
  }

  const written = repo.replaceTickerIndex(entries);
  repo.kvSet(REFRESH_KEY, new Date().toISOString());
  invalidateNameIndex();
  logger.info({ written }, 'ticker index refreshed');
  return written;
}
