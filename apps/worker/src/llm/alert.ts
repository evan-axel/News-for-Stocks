import { config } from '../config.js';
import { logger } from '../logger.js';
import { formatMoney } from '../enrich/derive.js';
import type { Alert, CompanyContext } from '../types.js';
import { getAnthropic, textOf } from './client.js';
import { renderCompanyContext } from './render.js';

/**
 * The voice of the whole product. Two rules do the heavy lifting: never invent a
 * number, and lead with why it matters rather than restating the headline — a
 * bot that just echoes the press release title is a worse RSS reader.
 */
const ALERT_SYSTEM = `You are the user's friend who reads financial filings and news all day and texts them when something looks interesting. You are texting them on WhatsApp right now.

How you write:
- Like a text message from a smart friend, not a research note. Short sentences. No headers, no bullet-point walls, no "Executive Summary".
- Lead with what happened and why it might matter, in one or two sentences. Do not restate the headline verbatim — they can read the headline.
- Then the context that changes how they'd read it: size of the company, what the financials look like, anything about management that's relevant.
- If the financial trend genuinely complicates or supports the story, say so plainly ("revenue's been flat for three years, so this reads like a forced move" / "they're compounding 30% with 70% gross margins, so this is offense not defense").
- 4 to 8 short lines total. WhatsApp, not email.
- End with the link on its own line.

Hard rules:
- ONLY use numbers that appear in the context block below. If market cap or financials say "not available", say you couldn't pull them — never estimate, never fill in from memory.
- Never predict a price or tell them to buy or sell. You surface things worth a look; they decide.
- Do not use markdown headers or tables. WhatsApp supports *bold*, _italic_ — use sparingly.
- No preamble like "Here's an alert" — just start the message.`;

export interface ComposeAlertInput {
  alert: Pick<
    Alert,
    'keywordTerm' | 'matchedPhrase' | 'title' | 'url' | 'sourceName' | 'sourceKind' | 'snippet' | 'publishedAt'
  >;
  context: CompanyContext | null;
}

/**
 * Write the WhatsApp text for one alert. Falls back to a plain deterministic
 * message when the LLM is unavailable, so a bad API key degrades the alert's
 * prose rather than stopping alerts entirely.
 */
export async function composeAlert({ alert, context }: ComposeAlertInput): Promise<string> {
  if (!config.ANTHROPIC_API_KEY) return fallbackAlert(alert, context);

  const contextBlock = context
    ? renderCompanyContext(context)
    : 'No company could be confidently identified for this item, so no financial context is available. Say so briefly.';

  const userPrompt = `A keyword you watch just fired.

Keyword: "${alert.keywordTerm}"
Matched phrase: "${alert.matchedPhrase}"
Source: ${alert.sourceName} (${alert.sourceKind})
Published: ${alert.publishedAt.toISOString()}
Headline: ${alert.title}
Link: ${alert.url}

Surrounding text from the source:
"""
${alert.snippet}
"""

Company context:
"""
${contextBlock}
"""

Write the text message.`;

  try {
    const res = await getAnthropic().messages.create({
      model: config.ALERT_MODEL,
      max_tokens: 8000,
      output_config: { effort: config.ALERT_EFFORT },
      system: ALERT_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    if (res.stop_reason === 'refusal') {
      logger.warn({ url: alert.url }, 'alert composition refused; using fallback');
      return fallbackAlert(alert, context);
    }

    const text = textOf(res.content);
    return text || fallbackAlert(alert, context);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'alert composition failed; using fallback');
    return fallbackAlert(alert, context);
  }
}

/** Deterministic, no-LLM version. Plain but always correct. */
export function fallbackAlert(
  alert: ComposeAlertInput['alert'],
  context: CompanyContext | null,
): string {
  const lines = [`🔔 "${alert.keywordTerm}" — ${alert.sourceName}`, '', alert.title];

  if (context) {
    lines.push(
      '',
      `${context.ref.name} (${context.ref.ticker}) · mkt cap ${formatMoney(
        context.quote.marketCap,
        context.quote.currency,
      )}`,
    );
    const newest = context.annual?.periods[0];
    const growth = context.annual?.revenueGrowthYoY[0];
    if (newest) {
      const parts = [`rev ${formatMoney(newest.revenue)}`];
      if (growth !== null && growth !== undefined) parts.push(`${(growth * 100).toFixed(0)}% YoY`);
      if (newest.freeCashFlow !== null) parts.push(`FCF ${formatMoney(newest.freeCashFlow)}`);
      lines.push(`${newest.label}: ${parts.join(' · ')}`);
    }
  }

  lines.push('', alert.url);
  return lines.join('\n');
}
