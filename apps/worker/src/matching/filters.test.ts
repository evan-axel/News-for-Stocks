import { describe, expect, it } from 'vitest';
import { evaluateFilters } from './filters.js';
import type { CompanyContext, Filter } from '../types.js';

function filter(partial: Partial<Filter> & { kind: Filter['kind'] }): Filter {
  return {
    id: 1,
    value: null,
    minValue: null,
    maxValue: null,
    mode: 'include',
    enabled: true,
    createdAt: new Date(),
    ...partial,
  };
}

function context(partial: {
  sector?: string | null;
  industry?: string | null;
  marketCap?: number | null;
  ticker?: string;
}): CompanyContext {
  return {
    ref: { ticker: partial.ticker ?? 'ACME', name: 'Acme Corp' },
    profile: {
      description: null,
      sector: partial.sector ?? 'Healthcare',
      industry: partial.industry ?? 'Biotechnology',
      employees: null,
      country: 'US',
      ipoDate: null,
      website: null,
    },
    quote: {
      price: 10,
      marketCap: partial.marketCap === undefined ? 1e9 : partial.marketCap,
      changePercent: null,
      currency: 'USD',
    },
    annual: null,
    quarterly: null,
    executives: [],
    insiderTrades: [],
    sources: [],
    warnings: [],
    fetchedAt: new Date(),
  };
}

describe('evaluateFilters', () => {
  it('passes everything when no filters are set', () => {
    expect(evaluateFilters([], context({})).passed).toBe(true);
  });

  it('passes when an include filter matches', () => {
    const f = [filter({ kind: 'sector', value: 'Healthcare' })];
    expect(evaluateFilters(f, context({ sector: 'Healthcare' })).passed).toBe(true);
  });

  it('blocks when an include filter does not match', () => {
    const f = [filter({ kind: 'sector', value: 'Energy' })];
    expect(evaluateFilters(f, context({ sector: 'Healthcare' })).passed).toBe(false);
  });

  it('matches text filters as case-insensitive substrings', () => {
    const f = [filter({ kind: 'industry', value: 'biotech' })];
    expect(evaluateFilters(f, context({ industry: 'Biotechnology' })).passed).toBe(true);
  });

  it('requires exact equality for ticker filters', () => {
    const f = [filter({ kind: 'ticker', value: 'ACM' })];
    expect(evaluateFilters(f, context({ ticker: 'ACME' })).passed).toBe(false);
  });

  it('ORs multiple include filters of the same kind', () => {
    const f = [
      filter({ kind: 'industry', value: 'Biotechnology' }),
      filter({ id: 2, kind: 'industry', value: 'Medical Devices' }),
    ];
    expect(evaluateFilters(f, context({ industry: 'Medical Devices' })).passed).toBe(true);
  });

  it('ANDs include filters across different kinds', () => {
    const f = [
      filter({ kind: 'industry', value: 'Biotechnology' }),
      filter({ id: 2, kind: 'market_cap', maxValue: 500e6 }),
    ];
    // Right industry, but too big.
    expect(evaluateFilters(f, context({ marketCap: 2e9 })).passed).toBe(false);
    expect(evaluateFilters(f, context({ marketCap: 100e6 })).passed).toBe(true);
  });

  it('lets an exclude filter veto an otherwise passing company', () => {
    const f = [
      filter({ kind: 'sector', value: 'Healthcare' }),
      filter({ id: 2, kind: 'ticker', value: 'ACME', mode: 'exclude' }),
    ];
    expect(evaluateFilters(f, context({})).passed).toBe(false);
  });

  it('respects market cap bounds inclusively', () => {
    const f = [filter({ kind: 'market_cap', minValue: 300e6, maxValue: 2e9 })];
    expect(evaluateFilters(f, context({ marketCap: 300e6 })).passed).toBe(true);
    expect(evaluateFilters(f, context({ marketCap: 2e9 })).passed).toBe(true);
    expect(evaluateFilters(f, context({ marketCap: 299e6 })).passed).toBe(false);
  });

  it('fails a size filter when market cap is unknown rather than passing it through', () => {
    const f = [filter({ kind: 'market_cap', maxValue: 2e9 })];
    expect(evaluateFilters(f, context({ marketCap: null })).passed).toBe(false);
  });

  it('ignores disabled filters', () => {
    const f = [filter({ kind: 'sector', value: 'Energy', enabled: false })];
    expect(evaluateFilters(f, context({ sector: 'Healthcare' })).passed).toBe(true);
  });

  it('passes an unidentified company only when no include filters exist', () => {
    expect(evaluateFilters([], null).passed).toBe(true);
    expect(evaluateFilters([filter({ kind: 'sector', value: 'Energy' })], null).passed).toBe(false);
  });

  it('still applies excludes to an unidentified company by passing it through', () => {
    // Excludes alone should not block an unknown company — there is nothing to match.
    const f = [filter({ kind: 'ticker', value: 'ACME', mode: 'exclude' })];
    expect(evaluateFilters(f, null).passed).toBe(true);
  });
});
