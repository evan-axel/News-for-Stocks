import { config, describeCapabilities } from '../config.js';
import type { Repo } from '../db/repo.js';
import { logger } from '../logger.js';
import { handleChatMessage } from '../llm/chat.js';
import { describeFilter } from '../matching/filters.js';
import { flushOutbox, recordInbound, sendWhatsApp } from '../whatsapp/twilio.js';

const HELP = `Here's what you can ask me:

*About a company* — just name it.
  "what's going on with ACME"
  "show me Apple's margins over 5 years"
  "how much cash does ACME have vs debt"

*Transcripts*
  "latest transcript for ACME"
  "what did ACME's CEO say about pricing"

*Filings & news*
  "recent 8-Ks for ACME"
  "any news on lithium refining"

*Your alerts*
  "what did you send me today"
  "what are you watching"

*Change what you watch*
  "also alert me on 'going private'"
  "only small caps under $2B"
  "just biotech and medtech"
  "stop watching reverse splits"

Commands: /help /status /pause /resume`;

/**
 * Handle one inbound WhatsApp message end to end.
 *
 * The inbound itself re-opens WhatsApp's 24-hour window, so the first thing we
 * do is flush anything that was parked while it was shut — the user should see
 * what they missed before the answer to what they just asked.
 */
export async function handleInbound(from: string, text: string, repo: Repo): Promise<string> {
  recordInbound(repo);

  const flushed = await flushOutbox(repo).catch((err) => {
    logger.error({ err: (err as Error).message }, 'outbox flush failed');
    return 0;
  });
  if (flushed > 0) {
    logger.info({ flushed }, 'delivered queued alerts on inbound');
  }

  const body = text.trim();
  if (!body) return "Didn't catch that — try /help.";

  const command = body.toLowerCase();

  if (command === '/help' || command === 'help') return HELP;

  if (command === '/status' || command === 'status') return statusReport(repo);

  if (command === '/pause') {
    repo.kvSet('alerts:paused', 'true');
    return 'Alerts paused. Send /resume when you want them back.';
  }

  if (command === '/resume') {
    repo.kvSet('alerts:paused', 'false');
    return "Alerts back on. I'll text you when something hits.";
  }

  if (command === '/reset') {
    repo.clearConversation(from);
    return "Cleared our chat history. Fresh start — what do you want to look at?";
  }

  try {
    const { reply, toolsUsed } = await handleChatMessage(from, body, repo);
    logger.info({ from, toolsUsed }, 'chat reply generated');
    return reply;
  } catch (err) {
    logger.error({ from, err: (err as Error).message }, 'chat handling failed');
    return "Something broke on my end pulling that together. Try again in a sec?";
  }
}

function statusReport(repo: Repo): string {
  const keywords = repo.listEnabledKeywords();
  const filters = repo.listFilters().filter((f) => f.enabled);
  const paused = repo.kvGet('alerts:paused') === 'true';
  const recent = repo.listAlerts({ limit: 100 });
  const last24 = recent.filter((a) => Date.now() - a.publishedAt.getTime() < 86_400_000);
  const health = repo.listSourceHealth();
  const broken = health.filter((h) => Number(h.consecutive_failures ?? 0) >= 3);

  return [
    `${paused ? '⏸ Alerts are *paused*' : '▶️ Alerts are on'}`,
    `Watching ${keywords.length} keyword${keywords.length === 1 ? '' : 's'}.`,
    filters.length
      ? `Filters: ${filters.map(describeFilter).join(', ')}`
      : 'No company filters — everything passes.',
    `${last24.length} alert${last24.length === 1 ? '' : 's'} in the last 24h.`,
    broken.length ? `⚠️ ${broken.length} source(s) failing: ${broken.map((h) => h.source_id).join(', ')}` : '',
    `Scanning every ${Math.round(config.SCAN_INTERVAL_SECONDS / 60)} min · ${describeCapabilities()}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Send the reply back over WhatsApp, forcing past the window check. */
export async function replyOnWhatsApp(text: string, repo: Repo): Promise<void> {
  // `force` is safe here: an inbound message just opened the session window.
  await sendWhatsApp(text, repo, { force: true });
}

export function alertsPaused(repo: Repo): boolean {
  return repo.kvGet('alerts:paused') === 'true';
}
