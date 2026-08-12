/** Twilio rejects WhatsApp bodies longer than this. */
export const WHATSAPP_MAX_CHARS = 1600;

/**
 * Split a message into WhatsApp-sized pieces, preferring clean breaks.
 *
 * Tries paragraph boundaries, then sentence ends, then whitespace, and only
 * hard-cuts mid-word when a single token exceeds the limit — a URL split across
 * two messages is unclickable, so keeping breaks at whitespace matters.
 */
export function chunkMessage(text: string, limit = WHATSAPP_MAX_CHARS): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed ? [trimmed] : [];

  const chunks: string[] = [];
  let rest = trimmed;

  while (rest.length > limit) {
    const window = rest.slice(0, limit);

    // Prefer the last paragraph break, then sentence end, then any whitespace.
    let cut = window.lastIndexOf('\n\n');
    if (cut < limit * 0.5) {
      const sentence = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('! '),
        window.lastIndexOf('? '),
      );
      cut = sentence >= limit * 0.5 ? sentence + 1 : -1;
    }
    if (cut < 0) {
      const space = window.lastIndexOf(' ');
      cut = space >= limit * 0.5 ? space : limit;
    }

    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) chunks.push(rest);

  // Number the parts so an out-of-order delivery is still readable.
  return chunks.length > 1
    ? chunks.map((c, i) => `${c}\n\n(${i + 1}/${chunks.length})`)
    : chunks;
}
