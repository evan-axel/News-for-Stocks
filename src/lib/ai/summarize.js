import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getClient, MODEL, buildDocumentBlocks, collectText } from './client';
import { buildFilingContext } from './context';

const SUMMARY_DIR = path.join(process.cwd(), 'data', 'summaries');
const VERSION = 2; // bump to invalidate every cached summary after a prompt change

const SYSTEM = `You are an experienced securities analyst reading a company's SEC filing for a
professional investor. The investor will read the filing themselves; your job is to tell them
what is in it and what deserves their attention, not to pad.

Rules:
- Cite the filing for every factual claim. Quote the narrowest span that supports the point.
- Use the filing's own numbers. Never estimate, round loosely, or infer a figure that is not stated.
- If something a reader would expect is absent, say it is absent. Absence is often the story.
- Do not compare against prior periods unless this document itself states the comparison.
- No boilerplate. Skip the legal throat-clearing that appears in every filing of this type.
- Plain English. Write "they borrowed $400m to buy back stock", not "the registrant effected a
  financing transaction".`;

const INSTRUCTION = `Write the analyst's read of this filing using exactly these sections:

## What this is
One sentence. The form type, the event or period, and the company.

## Why it matters
Two to four sentences on the investment significance. If the honest answer is "routine, nothing
here", say that plainly and keep it to one sentence.

## Key facts
Four to eight bullets. Concrete: figures, dates, names, terms. Each bullet cited.

## Watch items
Two to five bullets: risks disclosed, unusual language, things that would change the picture if
they develop. Include anything conspicuously missing.

## Questions this raises
Two to four specific questions an analyst should now go and answer, each pointing at where to look.`;

function summaryPath(accession) {
  // Accession numbers reach this app in both forms — dashed from the EDGAR
  // feed, plain from the page URL. Normalize, or the cache silently misses and
  // every page view pays to regenerate.
  const key = String(accession).replace(/-/g, '');
  const hash = crypto.createHash('sha256').update(`${VERSION}:${key}`).digest('hex').slice(0, 24);
  return path.join(SUMMARY_DIR, `${hash}.json`);
}

export async function readCachedSummary(accession) {
  try {
    return JSON.parse(await fs.readFile(summaryPath(accession), 'utf8'));
  } catch {
    return null;
  }
}

async function writeCachedSummary(accession, summary) {
  await fs.mkdir(SUMMARY_DIR, { recursive: true });
  const target = summaryPath(accession);
  const tmp = `${target}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(summary, null, 2), 'utf8');
  await fs.rename(tmp, target);
}

export async function summarizeFiling(filing, text, { force = false } = {}) {
  if (!force) {
    const cached = await readCachedSummary(filing.accession);
    if (cached) return { ...cached, cached: true };
  }

  const built = buildFilingContext(filing, text, 'summary overview significant events risks');
  const { blocks, offsets } = buildDocumentBlocks(built.parts);

  const client = getClient();

  // Streamed because a long filing plus adaptive thinking can exceed the
  // non-streaming HTTP timeout.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    messages: [{ role: 'user', content: [...blocks, { type: 'text', text: INSTRUCTION }] }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new Error(
      `The model declined to summarize this filing (${message.stop_details?.category || 'unspecified'}).`
    );
  }

  const summary = {
    accession: filing.accession,
    form: filing.form,
    filingDate: filing.filingDate,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    truncated: built.truncated,
    coverage: built.coverage ?? 1,
    runs: collectText(message.content, offsets),
    usage: {
      input: message.usage?.input_tokens ?? 0,
      output: message.usage?.output_tokens ?? 0,
      cacheRead: message.usage?.cache_read_input_tokens ?? 0,
      cacheWrite: message.usage?.cache_creation_input_tokens ?? 0,
    },
  };

  await writeCachedSummary(filing.accession, summary);
  return { ...summary, cached: false };
}
