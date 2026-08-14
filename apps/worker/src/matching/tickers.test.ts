import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../db/index.js';
import { normalizeCompanyName, Repo } from '../db/repo.js';
import { extractTickers, invalidateNameIndex, resolveByName, resolveCompany } from './tickers.js';
import type { RawItem } from '../types.js';

function makeRepo(): Repo {
  const repo = new Repo(createMemoryDb());
  repo.replaceTickerIndex([
    { ticker: 'ACME', cik: '0000000001', name: 'Acme Corporation' },
    { ticker: 'AAPL', cik: '0000320193', name: 'Apple Inc.' },
    { ticker: 'APLE', cik: '0000000002', name: 'Apple Hospitality REIT, Inc.' },
    { ticker: 'BETA', cik: '0000000003', name: 'Beta Technologies Ltd' },
  ]);
  invalidateNameIndex();
  return repo;
}

function item(partial: Partial<RawItem> = {}): RawItem {
  return {
    externalId: 'x',
    sourceId: 's',
    sourceName: 'S',
    sourceKind: 'newswire',
    title: '',
    url: 'https://a.test/x',
    body: '',
    publishedAt: new Date(),
    ...partial,
  };
}

let repo: Repo;
beforeEach(() => {
  repo = makeRepo();
});

describe('extractTickers', () => {
  it('pulls tickers from parenthesised exchange prefixes', () => {
    expect(extractTickers('Acme Corp (NASDAQ: ACME) announced')).toContain('ACME');
    expect(extractTickers('Beta (NYSE American: BETA) said')).toContain('BETA');
    expect(extractTickers('(OTCQB: ABCD)')).toContain('ABCD');
  });

  it('pulls tickers from bare exchange prefixes', () => {
    expect(extractTickers('shares of NASDAQ: ACME rose')).toContain('ACME');
  });

  it('pulls cashtags', () => {
    expect(extractTickers('watching $ACME today')).toContain('ACME');
  });

  it('ignores common all-caps words that look like tickers', () => {
    const found = extractTickers('The CEO and CFO discussed GAAP and EPS with the SEC');
    expect(found).not.toContain('CEO');
    expect(found).not.toContain('GAAP');
    expect(found).not.toContain('SEC');
  });

  it('deduplicates and preserves reliability order', () => {
    const found = extractTickers('Acme (NASDAQ: ACME) — $ACME rallied. $BETA too.');
    expect(found[0]).toBe('ACME');
    expect(found.filter((t) => t === 'ACME')).toHaveLength(1);
    expect(found).toContain('BETA');
  });
});

describe('normalizeCompanyName', () => {
  it('strips corporate suffixes and punctuation', () => {
    expect(normalizeCompanyName('Acme Corporation')).toBe('acme');
    expect(normalizeCompanyName('Apple Inc.')).toBe('apple');
    expect(normalizeCompanyName('Beta Technologies Ltd')).toBe('beta');
  });
});

describe('resolveByName', () => {
  it('finds a company named in a headline', () => {
    expect(resolveByName('Acme Corporation announces buyback', repo)?.ticker).toBe('ACME');
  });

  it('prefers the longest matching name', () => {
    // "Apple Hospitality" must not lose to bare "Apple".
    expect(resolveByName('Apple Hospitality REIT reports Q3', repo)?.ticker).toBe('APLE');
  });

  it('returns null when nothing matches', () => {
    expect(resolveByName('Unrelated company news', repo)).toBeNull();
  });

  it('does not match on a fragment of a longer word', () => {
    expect(resolveByName('Acmex Holdings announces', repo)).toBeNull();
  });
});

describe('resolveCompany', () => {
  it('trusts a source-declared ticker first', () => {
    const ref = resolveCompany(item({ declaredTickers: ['AAPL'], title: 'Acme news' }), repo);
    expect(ref?.ticker).toBe('AAPL');
    expect(ref?.cik).toBe('0000320193');
  });

  it('accepts a declared ticker even when absent from the SEC index', () => {
    const ref = resolveCompany(item({ declaredTickers: ['XYZQ'], title: 'Foreign issuer news' }), repo);
    expect(ref?.ticker).toBe('XYZQ');
  });

  it('falls back to a ticker scraped from the text', () => {
    const ref = resolveCompany(item({ title: 'Something (NASDAQ: ACME) happened' }), repo);
    expect(ref?.ticker).toBe('ACME');
    expect(ref?.name).toBe('Acme Corporation');
  });

  it('falls back to a name match in the headline', () => {
    expect(resolveCompany(item({ title: 'Beta Technologies raises capital' }), repo)?.ticker).toBe('BETA');
  });

  it('does not name-match on body text alone', () => {
    // The body mentions Acme as an advisor's other client; the story is not about it.
    const ref = resolveCompany(
      item({ title: 'Unknown Private Co raises a round', body: 'Acme Corporation was also advised.' }),
      repo,
    );
    expect(ref).toBeNull();
  });

  it('returns null rather than guessing when nothing is confident', () => {
    expect(resolveCompany(item({ title: 'Markets rose today' }), repo)).toBeNull();
  });
});
