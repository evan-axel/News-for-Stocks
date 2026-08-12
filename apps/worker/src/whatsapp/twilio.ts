import twilio from 'twilio';
import { capabilities, config } from '../config.js';
import type { Repo } from '../db/repo.js';
import { logger } from '../logger.js';
import { chunkMessage } from './chunk.js';

const LAST_INBOUND_KEY = 'whatsapp:lastInboundAt';
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

let client: ReturnType<typeof twilio> | null = null;

function getClient(): ReturnType<typeof twilio> {
  if (!capabilities.whatsapp) throw new Error('Twilio is not configured.');
  client ??= twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  return client;
}

/** Record that the user just messaged us — this opens the 24-hour window. */
export function recordInbound(repo: Repo): void {
  repo.kvSet(LAST_INBOUND_KEY, new Date().toISOString());
}

export function sessionWindowOpen(repo: Repo): boolean {
  const last = repo.kvGet(LAST_INBOUND_KEY);
  if (!last) return false;
  return Date.now() - new Date(last).getTime() < SESSION_WINDOW_MS;
}

export interface SendResult {
  delivered: boolean;
  queued: boolean;
  reason: string;
}

/**
 * Send a freeform WhatsApp message, chunked to fit.
 *
 * Freeform messages are only permitted inside the 24-hour session window that
 * the user's own last message opened. Outside it, WhatsApp rejects the send, so
 * we park the text in the outbox and (if a template is configured) fire a short
 * approved template to nudge them — replying re-opens the window and flushes
 * everything queued.
 */
export async function sendWhatsApp(
  body: string,
  repo: Repo,
  opts: { alertId?: number | null; force?: boolean } = {},
): Promise<SendResult> {
  const to = config.ALERT_RECIPIENT;

  if (config.DRY_RUN || !capabilities.whatsapp) {
    logger.info(
      { to, dryRun: config.DRY_RUN, configured: capabilities.whatsapp, body },
      'WhatsApp send skipped — logging instead',
    );
    return {
      delivered: false,
      queued: false,
      reason: config.DRY_RUN ? 'DRY_RUN is on' : 'Twilio is not configured',
    };
  }

  if (!opts.force && !sessionWindowOpen(repo)) {
    repo.queueOutbound(to, body, opts.alertId ?? null);
    const nudged = await sendTemplateNudge(repo);
    return {
      delivered: false,
      queued: true,
      reason: nudged
        ? 'outside the 24h window — queued and sent a template nudge'
        : 'outside the 24h window — queued (no template configured, so no nudge was sent)',
    };
  }

  await deliverChunks(body, to);
  return { delivered: true, queued: false, reason: 'sent' };
}

async function deliverChunks(body: string, to: string): Promise<void> {
  const chunks = chunkMessage(body);
  for (const chunk of chunks) {
    await getClient().messages.create({ from: config.TWILIO_WHATSAPP_FROM, to, body: chunk });
  }
  logger.info({ to, chunks: chunks.length }, 'WhatsApp message sent');
}

/**
 * Fire the approved template that is allowed outside the session window.
 * Returns false when no template SID is configured.
 */
async function sendTemplateNudge(repo: Repo): Promise<boolean> {
  if (!config.TWILIO_ALERT_TEMPLATE_SID) return false;

  const pending = repo.countPendingOutbound(config.ALERT_RECIPIENT);
  try {
    await getClient().messages.create({
      from: config.TWILIO_WHATSAPP_FROM,
      to: config.ALERT_RECIPIENT,
      contentSid: config.TWILIO_ALERT_TEMPLATE_SID,
      contentVariables: JSON.stringify({ '1': String(pending) }),
    });
    return true;
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'template nudge failed');
    return false;
  }
}

/**
 * Deliver everything parked while the window was shut. Called right after an
 * inbound message, which is exactly when sending becomes legal again.
 */
export async function flushOutbox(repo: Repo): Promise<number> {
  if (config.DRY_RUN || !capabilities.whatsapp) return 0;

  const pending = repo.pendingOutbound(config.ALERT_RECIPIENT);
  let sent = 0;

  for (const item of pending) {
    try {
      await deliverChunks(item.body, config.ALERT_RECIPIENT);
      repo.markOutboundDelivered(item.id);
      if (item.alertId) repo.markAlertSent(item.alertId, item.body);
      sent++;
    } catch (err) {
      logger.error({ id: item.id, err: (err as Error).message }, 'outbox delivery failed');
      break; // stop on first failure so ordering is preserved
    }
  }

  if (sent) logger.info({ sent }, 'flushed queued WhatsApp messages');
  return sent;
}

/**
 * Verify an inbound webhook actually came from Twilio.
 *
 * The signature is computed over the exact public URL Twilio was configured
 * with, so PUBLIC_BASE_URL must match it including scheme and path.
 */
export function verifyTwilioSignature(
  signature: string | undefined,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!config.TWILIO_VALIDATE_SIGNATURE) return true;
  if (!signature || !config.TWILIO_AUTH_TOKEN) return false;
  return twilio.validateRequest(config.TWILIO_AUTH_TOKEN, signature, url, params);
}
