import { chunkText, buildIndex, search } from '@/lib/rag/retrieve';

/**
 * Below this, a filing is sent whole — the model sees every word and citation
 * offsets are already absolute. Roughly 150k tokens, which most filings other
 * than a large 10-K fit inside.
 */
export const MAX_FULL_CHARS = 600_000;

function label(filing) {
  const parts = [filing.form, filing.filingDate];
  if (filing.ticker) parts.unshift(filing.ticker);
  return parts.filter(Boolean).join(' · ');
}

function context(filing) {
  const bits = [`Form ${filing.form}`, `filed ${filing.filingDate}`];
  if (filing.reportDate) bits.push(`period ${filing.reportDate}`);
  if (filing.itemLabels?.length) bits.push(`items: ${filing.itemLabels.join('; ')}`);
  return `${filing.companyName || ''} ${bits.join(', ')}`.trim();
}

/**
 * Context for a question about one filing. Whole document when it fits,
 * retrieved passages when it does not — each passage keeps its offset so
 * citations still resolve against the full text shown in the viewer.
 */
export function buildFilingContext(filing, text, query, { limit = 12 } = {}) {
  if (text.length <= MAX_FULL_CHARS) {
    return {
      truncated: false,
      parts: [
        {
          text,
          title: label(filing),
          context: context(filing),
          offset: 0,
          accession: filing.accession,
        },
      ],
    };
  }

  const chunks = chunkText(text);
  const index = buildIndex(chunks);
  const hits = search(index, query || '', limit).sort((a, b) => a.start - b.start);

  // If the query matched nothing, fall back to the head of the document rather
  // than sending no context at all.
  const selected = hits.length ? hits : chunkText(text).slice(0, limit);

  return {
    truncated: true,
    coverage: selected.reduce((sum, c) => sum + c.text.length, 0) / text.length,
    parts: selected.map((chunk) => ({
      text: chunk.text,
      title: `${label(filing)} (excerpt @ ${chunk.start})`,
      context: context(filing),
      offset: chunk.start,
      accession: filing.accession,
    })),
  };
}

/**
 * Context for a question spanning a company's filing history. Every indexed
 * filing is chunked into one pool and the best passages win regardless of which
 * filing they came from, so an answer can draw on several years at once.
 */
export function buildHistoryContext(entries, query, { limit = 16 } = {}) {
  const pool = [];

  for (const entry of entries) {
    for (const chunk of chunkText(entry.text)) {
      pool.push({ ...chunk, filing: entry.filing });
    }
  }

  if (!pool.length) return { truncated: false, parts: [], filingsSearched: 0 };

  const index = buildIndex(pool);
  const hits = search(index, query || '', limit);

  hits.sort((a, b) => {
    if (a.filing.filingDate !== b.filing.filingDate) {
      return a.filing.filingDate < b.filing.filingDate ? 1 : -1;
    }
    return a.start - b.start;
  });

  return {
    truncated: true,
    filingsSearched: entries.length,
    filingsCited: new Set(hits.map((h) => h.filing.accession)).size,
    parts: hits.map((chunk) => ({
      text: chunk.text,
      title: `${label(chunk.filing)} (excerpt @ ${chunk.start})`,
      context: context(chunk.filing),
      offset: chunk.start,
      accession: chunk.filing.accession,
    })),
  };
}
