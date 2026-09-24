import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-opus-5';

/**
 * Filings are long, so nearly every call here is document-heavy. Two things
 * follow: requests stream (a 10-K summary can run well past an HTTP timeout),
 * and the document block carries `cache_control` so a follow-up question does
 * not pay to re-read the filing.
 */
let client = null;

// Bracket access on purpose: Next inlines and folds away `process.env.FOO`
// written as a property access, which would freeze the build-time value into
// the bundle. See the same note in lib/sec/client.js.
function env(name) {
  return process.env[name];
}

export function getClient() {
  const apiKey = env('ANTHROPIC_API_KEY');
  if (!apiKey) {
    const error = new Error(
      'ANTHROPIC_API_KEY is not set. Summaries and chat need it; search and the filing text do not.'
    );
    error.code = 'NO_API_KEY';
    throw error;
  }
  if (!client) {
    const baseURL = env('ANTHROPIC_BASE_URL');
    client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }
  return client;
}

export function hasApiKey() {
  return Boolean(env('ANTHROPIC_API_KEY'));
}

/** Maps SDK errors onto something an API route can return honestly. */
export function describeError(error) {
  if (error?.code === 'NO_API_KEY') return { status: 503, message: error.message };
  if (error instanceof Anthropic.AuthenticationError) {
    return { status: 502, message: 'Anthropic rejected the API key.' };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, message: 'Rate limited by Anthropic. Try again shortly.' };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { status: 400, message: `Request rejected: ${error.message}` };
  }
  if (error instanceof Anthropic.APIError) {
    return { status: 502, message: `Anthropic API error ${error.status}: ${error.message}` };
  }
  return { status: 500, message: error?.message || 'Unknown error' };
}

/**
 * Builds the document blocks for a request, and the map that turns a returned
 * citation back into an offset in the full filing text.
 *
 * Under the size ceiling the whole filing goes in one block and offsets are
 * already absolute. Above it, only retrieved passages are sent, so each block
 * carries the offset of the passage it came from.
 */
export function buildDocumentBlocks(parts) {
  const blocks = parts.map((part, i) => ({
    type: 'document',
    source: { type: 'text', media_type: 'text/plain', data: part.text },
    title: part.title,
    context: part.context,
    citations: { enabled: true },
    // Cache the document prefix so follow-up turns reuse it.
    ...(i === parts.length - 1 ? { cache_control: { type: 'ephemeral', ttl: '1h' } } : {}),
  }));

  const offsets = parts.map((part) => ({
    offset: part.offset || 0,
    accession: part.accession || null,
    title: part.title,
  }));

  return { blocks, offsets };
}

/**
 * Normalizes response content into text runs with resolved citations.
 * `document_index` indexes the document blocks in request order.
 */
export function collectText(content, offsets = []) {
  const runs = [];

  for (const block of content) {
    if (block.type !== 'text') continue;

    const citations = (block.citations || [])
      .map((citation) => {
        const base = offsets[citation.document_index] || { offset: 0 };
        if (citation.type !== 'char_location') {
          return {
            text: citation.cited_text || '',
            title: citation.document_title || base.title || '',
            accession: base.accession || null,
            start: null,
            end: null,
          };
        }
        return {
          text: citation.cited_text || '',
          title: citation.document_title || base.title || '',
          accession: base.accession || null,
          start: base.offset + citation.start_char_index,
          end: base.offset + citation.end_char_index,
        };
      })
      .filter(Boolean);

    runs.push({ text: block.text, citations });
  }

  return runs;
}
