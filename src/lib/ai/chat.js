import { getClient, MODEL, buildDocumentBlocks } from './client';

const SYSTEM = `You are a securities analyst answering questions strictly from the SEC filings
provided in this conversation.

Rules:
- Ground every factual claim in the supplied filings and cite it. Quote the narrowest span that
  supports the claim.
- If the filings provided do not answer the question, say so directly and say what document would.
  Never fill a gap from general knowledge of the company or the industry.
- Distinguish what a filing states from what it implies. Flag the difference when it matters.
- When passages come from several filings, note which filing and date each fact comes from;
  disclosure that changed over time is usually the point of the question.
- Use the filing's own figures verbatim. Do not compute derived metrics unless asked, and show the
  inputs when you do.
- Answer at the length the question deserves. A factual lookup gets a sentence, not an essay.`;

/**
 * Builds a streaming chat turn. Documents ride on the current user message
 * every turn rather than being pinned to the first: retrieval picks different
 * passages per question, and prompt caching makes resending a whole filing
 * cheap on the turns where the passages are unchanged.
 */
export function createChatStream({ parts, history = [], question }) {
  const { blocks, offsets } = buildDocumentBlocks(parts);
  const client = getClient();

  const messages = [
    ...history
      .filter((turn) => turn?.content?.trim())
      .map((turn) => ({
        role: turn.role === 'assistant' ? 'assistant' : 'user',
        content: turn.content,
      })),
    { role: 'user', content: [...blocks, { type: 'text', text: question }] },
  ];

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    messages,
  });

  return { stream, offsets };
}
