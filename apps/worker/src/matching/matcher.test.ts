import { describe, expect, it } from 'vitest';
import { extractSnippet, findMatches, phraseRegex } from './matcher.js';
import type { Keyword, RawItem } from '../types.js';

function keyword(partial: Partial<Keyword> & { term: string }): Keyword {
  return {
    id: 1,
    synonyms: [],
    negations: [],
    enabled: true,
    createdAt: new Date(),
    ...partial,
  };
}

function item(partial: Partial<RawItem> = {}): RawItem {
  return {
    externalId: 'https://example.com/a',
    sourceId: 'test',
    sourceName: 'Test Wire',
    sourceKind: 'newswire',
    title: 'Acme Corp announces something',
    url: 'https://example.com/a',
    body: '',
    publishedAt: new Date('2026-08-01T00:00:00Z'),
    ...partial,
  };
}

describe('phraseRegex', () => {
  it('matches whole words only', () => {
    expect(phraseRegex('merger').test('a merger today')).toBe(true);
    expect(phraseRegex('merger').test('mergers and acquisitions')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(phraseRegex('strategic review').test('STRATEGIC REVIEW')).toBe(true);
  });

  it('tolerates newlines and multiple spaces inside a phrase', () => {
    expect(phraseRegex('strategic alternatives').test('strategic\n  alternatives')).toBe(true);
  });

  it('matches phrases that end in non-word characters', () => {
    expect(phraseRegex('spin-off').test('a spin-off of the unit')).toBe(true);
  });

  it('escapes regex metacharacters in the phrase', () => {
    expect(phraseRegex('10-K (annual)').test('filed its 10-K (annual) report')).toBe(true);
  });
});

describe('extractSnippet', () => {
  it('returns surrounding context with ellipses', () => {
    const text = `${'a'.repeat(300)} TARGET ${'b'.repeat(300)}`;
    const idx = text.indexOf('TARGET');
    const snippet = extractSnippet(text, idx, 'TARGET'.length);
    expect(snippet).toContain('TARGET');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThan(text.length);
  });

  it('omits ellipses when the whole string fits', () => {
    const snippet = extractSnippet('short TARGET text', 6, 6);
    expect(snippet).toBe('short TARGET text');
  });
});

describe('findMatches', () => {
  it('matches the canonical term', () => {
    const matches = findMatches(
      item({ title: 'Acme begins a strategic review' }),
      [keyword({ term: 'strategic review' })],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.matchedPhrase.toLowerCase()).toBe('strategic review');
  });

  it('matches synonyms', () => {
    const matches = findMatches(
      item({ title: 'Acme explores strategic alternatives' }),
      [keyword({ term: 'strategic review', synonyms: ['strategic alternatives'] })],
    );
    expect(matches).toHaveLength(1);
  });

  it('returns at most one match per keyword even on repeated phrases', () => {
    const matches = findMatches(
      item({
        title: 'Strategic review announced',
        body: 'strategic review. strategic review. strategic review.',
      }),
      [keyword({ term: 'strategic review' })],
    );
    expect(matches).toHaveLength(1);
  });

  it('prefers a title hit over a body hit', () => {
    const matches = findMatches(
      item({ title: 'Acme announces a spin-off', body: 'unrelated spin-off of another firm' }),
      [keyword({ term: 'spin-off' })],
    );
    expect(matches[0]?.snippet).toContain('Acme announces');
  });

  it('vetoes a match when a negation appears anywhere in the document', () => {
    const matches = findMatches(
      item({
        title: 'Acme completed the acquisition of Beta',
        body: 'This release completed the acquisition discussion.',
      }),
      [keyword({ term: 'acquisition', negations: ['completed the acquisition'] })],
    );
    expect(matches).toHaveLength(0);
  });

  it('skips disabled keywords', () => {
    const matches = findMatches(
      item({ title: 'Acme begins a strategic review' }),
      [keyword({ term: 'strategic review', enabled: false })],
    );
    expect(matches).toHaveLength(0);
  });

  it('reports one match per distinct keyword', () => {
    const matches = findMatches(
      item({ title: 'Acme announces CEO transition and a strategic review' }),
      [
        keyword({ term: 'strategic review' }),
        keyword({ id: 2, term: 'ceo change', synonyms: ['ceo transition'] }),
      ],
    );
    expect(matches).toHaveLength(2);
  });
});
