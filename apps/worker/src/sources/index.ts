import type { Repo } from '../db/repo.js';
import { logger } from '../logger.js';
import { createFeedSource, FEED_CATALOG, googleNewsFeedFor } from './feed-source.js';
import { createSecCurrentFilingsSource, createSecFullTextSource } from './sec.js';
import type { Source, SourceResult } from './types.js';

/**
 * Assemble the source list for one scan.
 *
 * Static wires and news feeds are always polled. On top of those we derive two
 * keyword-driven sources per enabled keyword — a Google News search and an EDGAR
 * full-text search — which is what makes a newly added keyword start producing
 * hits immediately rather than only when it happens to appear in a fixed feed.
 */
export function buildSources(repo: Repo): Source[] {
  const sources: Source[] = FEED_CATALOG.map((def) => createFeedSource(def, repo));

  sources.push(createSecCurrentFilingsSource('8-K', 100));

  for (const keyword of repo.listEnabledKeywords()) {
    sources.push(createFeedSource(googleNewsFeedFor(keyword.term), repo));
    sources.push(createSecFullTextSource(keyword.term));
  }

  return sources;
}

/**
 * Fetch every source with bounded concurrency, isolating failures.
 *
 * One dead feed must never stop a scan, so each source is wrapped and its
 * outcome recorded in source_health for the dashboard to surface.
 */
export async function collectFromSources(
  sources: Source[],
  repo: Repo,
  concurrency = 6,
): Promise<SourceResult[]> {
  const results: SourceResult[] = [];
  const queue = [...sources];

  async function worker(): Promise<void> {
    for (;;) {
      const source = queue.shift();
      if (!source) return;

      const started = Date.now();
      try {
        const items = await source.fetch();
        repo.recordSourceOk(source.id, items.length);
        results.push({ sourceId: source.id, items, error: null, durationMs: Date.now() - started });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        repo.recordSourceError(source.id, error.message);
        logger.warn({ source: source.id, err: error.message }, 'source fetch failed');
        results.push({ sourceId: source.id, items: [], error, durationMs: Date.now() - started });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, worker));
  return results;
}

export type { Source, SourceResult };
