import { config } from '../config.js';
import type { Repo } from '../db/repo.js';
import { getCompanyContext } from '../enrich/company.js';
import { logger } from '../logger.js';
import { composeAlert } from '../llm/alert.js';
import { evaluateFilters } from '../matching/filters.js';
import { findMatches } from '../matching/matcher.js';
import { resolveCompany } from '../matching/tickers.js';
import { buildSources, collectFromSources } from '../sources/index.js';
import type { CompanyContext, RawItem } from '../types.js';
import { sendWhatsApp } from '../whatsapp/twilio.js';

export interface ScanSummary {
  sourcesPolled: number;
  sourcesFailed: number;
  itemsSeen: number;
  itemsNew: number;
  matches: number;
  alertsCreated: number;
  alertsSent: number;
  alertsQueued: number;
  alertsSuppressed: number;
  durationMs: number;
}

/**
 * One full pass: poll every source, match keywords, gate on company filters,
 * enrich, and send.
 *
 * Ordering is deliberate — the cheap checks run first. Age and dedupe run before
 * keyword matching, and keyword matching runs before company resolution and
 * enrichment, so a scan that sees 2,000 headlines makes only a handful of
 * billable data-provider calls.
 */
export async function runScan(repo: Repo): Promise<ScanSummary> {
  const started = Date.now();
  const summary: ScanSummary = {
    sourcesPolled: 0,
    sourcesFailed: 0,
    itemsSeen: 0,
    itemsNew: 0,
    matches: 0,
    alertsCreated: 0,
    alertsSent: 0,
    alertsQueued: 0,
    alertsSuppressed: 0,
    durationMs: 0,
  };

  const keywords = repo.listEnabledKeywords();
  if (keywords.length === 0) {
    logger.warn('no enabled keywords — nothing to match against; run `npm run seed`');
    summary.durationMs = Date.now() - started;
    return summary;
  }

  const sources = buildSources(repo);
  const results = await collectFromSources(sources, repo);

  summary.sourcesPolled = results.length;
  summary.sourcesFailed = results.filter((r) => r.error).length;

  const cutoff = Date.now() - config.MAX_ITEM_AGE_HOURS * 3_600_000;
  const filters = repo.listFilters();

  // Cache per scan: one story often appears on several wires at once, and each
  // copy would otherwise trigger its own provider lookups.
  const contextCache = new Map<string, CompanyContext | null>();

  for (const result of results) {
    for (const item of result.items) {
      summary.itemsSeen++;

      if (item.publishedAt.getTime() < cutoff) continue;
      if (!repo.markSeenIfNew(item.externalId, item.sourceId)) continue;
      summary.itemsNew++;

      const matches = findMatches(item, keywords);
      if (matches.length === 0) continue;
      summary.matches += matches.length;

      await handleMatchedItem(item, matches, filters, contextCache, repo, summary);
    }
  }

  summary.durationMs = Date.now() - started;
  logger.info(summary, 'scan complete');
  return summary;
}

async function handleMatchedItem(
  item: RawItem,
  matches: ReturnType<typeof findMatches>,
  filters: ReturnType<Repo['listFilters']>,
  contextCache: Map<string, CompanyContext | null>,
  repo: Repo,
  summary: ScanSummary,
): Promise<void> {
  const ref = resolveCompany(item, repo);

  let context: CompanyContext | null = null;
  if (ref) {
    const key = ref.ticker.toUpperCase();
    if (contextCache.has(key)) {
      context = contextCache.get(key) ?? null;
    } else {
      try {
        context = await getCompanyContext(ref, repo);
      } catch (err) {
        logger.warn({ ticker: key, err: (err as Error).message }, 'enrichment failed');
        context = null;
      }
      contextCache.set(key, context);
    }
  }

  const decision = evaluateFilters(filters, context);

  for (const match of matches) {
    const alertId = repo.insertAlert({
      externalId: item.externalId,
      ticker: ref?.ticker ?? null,
      companyName: ref?.name ?? null,
      keywordTerm: match.keyword.term,
      matchedPhrase: match.matchedPhrase,
      title: item.title,
      url: item.url,
      sourceName: item.sourceName,
      sourceKind: item.sourceKind,
      snippet: match.snippet,
      publishedAt: item.publishedAt,
    });

    // null means this (item, keyword) pair was already recorded on a prior scan.
    if (alertId === null) continue;
    summary.alertsCreated++;

    if (!decision.passed) {
      repo.markAlertSuppressed(alertId, decision.reason);
      summary.alertsSuppressed++;
      continue;
    }

    // Paused still records the alert — the user can catch up with "what did I
    // miss" — it just doesn't buzz their phone.
    if (repo.kvGet('alerts:paused') === 'true') {
      repo.markAlertSuppressed(alertId, 'alerts paused by user');
      summary.alertsSuppressed++;
      continue;
    }

    if (repo.countAlertsSentSince(new Date(Date.now() - 3_600_000)) >= config.MAX_ALERTS_PER_HOUR) {
      repo.markAlertSuppressed(alertId, `hourly cap of ${config.MAX_ALERTS_PER_HOUR} reached`);
      summary.alertsSuppressed++;
      continue;
    }

    await deliverAlert(alertId, item, match, context, repo, summary);
  }
}

async function deliverAlert(
  alertId: number,
  item: RawItem,
  match: ReturnType<typeof findMatches>[number],
  context: CompanyContext | null,
  repo: Repo,
  summary: ScanSummary,
): Promise<void> {
  let body: string | null = null;
  try {
    body = await composeAlert({
      alert: {
        keywordTerm: match.keyword.term,
        matchedPhrase: match.matchedPhrase,
        title: item.title,
        url: item.url,
        sourceName: item.sourceName,
        sourceKind: item.sourceKind,
        snippet: match.snippet,
        publishedAt: item.publishedAt,
      },
      context,
    });

    const result = await sendWhatsApp(body, repo, { alertId });

    if (result.delivered) {
      repo.markAlertSent(alertId, body);
      summary.alertsSent++;
    } else if (result.queued) {
      // Left pending: flushOutbox marks it sent once the window reopens.
      summary.alertsQueued++;
    } else {
      repo.markAlertFailed(alertId, result.reason, body);
    }
  } catch (err) {
    const message = (err as Error).message;
    logger.error({ alertId, err: message }, 'alert delivery failed');
    repo.markAlertFailed(alertId, message, body);
  }
}
