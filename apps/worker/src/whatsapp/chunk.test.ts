import { describe, expect, it } from 'vitest';
import { chunkMessage, WHATSAPP_MAX_CHARS } from './chunk.js';

describe('chunkMessage', () => {
  it('returns a single chunk when the text fits', () => {
    expect(chunkMessage('hello')).toEqual(['hello']);
  });

  it('returns nothing for empty input', () => {
    expect(chunkMessage('   ')).toEqual([]);
  });

  it('splits long text into pieces under the limit', () => {
    const text = 'word '.repeat(1000);
    const chunks = chunkMessage(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(WHATSAPP_MAX_CHARS + 12); // + part marker
    }
  });

  it('numbers the parts when it splits', () => {
    const chunks = chunkMessage('word '.repeat(1000));
    expect(chunks[0]).toMatch(/\(1\/\d+\)$/);
    expect(chunks.at(-1)).toMatch(new RegExp(`\\(${chunks.length}/${chunks.length}\\)$`));
  });

  it('does not split in the middle of a URL', () => {
    const url = 'https://example.com/a-very-long-path-that-should-stay-intact-please';
    const chunks = chunkMessage(`${'filler '.repeat(300)}${url}`);
    const joined = chunks.join(' ');
    expect(joined).toContain(url);
  });

  it('prefers paragraph breaks', () => {
    const a = 'a'.repeat(900);
    const b = 'b'.repeat(900);
    const chunks = chunkMessage(`${a}\n\n${b}`);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.startsWith(a)).toBe(true);
    expect(chunks[1]?.startsWith(b)).toBe(true);
  });

  it('hard-splits a single oversized token rather than looping forever', () => {
    const chunks = chunkMessage('x'.repeat(5000));
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.join('').replace(/\s|\(\d+\/\d+\)/g, '')).toHaveLength(5000);
  });
});
