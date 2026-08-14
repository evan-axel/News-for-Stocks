import type { CompanyContext, Filter, FilterKind } from '../types.js';

export interface FilterDecision {
  passed: boolean;
  /** Human-readable explanation, surfaced in the dashboard and logs. */
  reason: string;
}

const TEXT_KINDS: FilterKind[] = ['sector', 'industry', 'exchange', 'country', 'ticker'];

/** Value on the company that a text filter compares against. */
function fieldFor(kind: FilterKind, ctx: CompanyContext): string | null {
  switch (kind) {
    case 'sector':
      return ctx.profile.sector;
    case 'industry':
      return ctx.profile.industry;
    case 'exchange':
      return ctx.ref.exchange ?? null;
    case 'country':
      return ctx.profile.country;
    case 'ticker':
      return ctx.ref.ticker;
    default:
      return null;
  }
}

function matches(filter: Filter, ctx: CompanyContext): boolean {
  if (filter.kind === 'market_cap') {
    const cap = ctx.quote.marketCap;
    // An unknown market cap cannot satisfy a size filter. Treating it as a pass
    // would quietly flood a small-cap watchlist with mega-caps whose quote failed.
    if (cap === null) return false;
    if (filter.minValue !== null && cap < filter.minValue) return false;
    if (filter.maxValue !== null && cap > filter.maxValue) return false;
    return true;
  }

  const field = fieldFor(filter.kind, ctx);
  if (field === null || !filter.value) return false;

  const needle = filter.value.trim().toLowerCase();
  const haystack = field.toLowerCase();
  // Tickers must match exactly; the rest are substring matches so "Biotech"
  // catches "Biotechnology" and "Health Care" catches "Health Care Equipment".
  return filter.kind === 'ticker' ? haystack === needle : haystack.includes(needle);
}

/**
 * Decide whether a company passes the filter set.
 *
 * Semantics, chosen so that adding your first filter narrows rather than breaks:
 *   - Any matching `exclude` filter vetoes immediately.
 *   - For each kind that has enabled `include` filters, at least one must match.
 *   - Kinds with no include filters are unconstrained.
 *   - No include filters at all means everything passes.
 *
 * With no resolved company (`ctx` null), the item passes only when no include
 * filters exist — we can't verify an unknown company against a size or sector
 * rule, and guessing in either direction is worse than being explicit.
 */
export function evaluateFilters(filters: Filter[], ctx: CompanyContext | null): FilterDecision {
  const active = filters.filter((f) => f.enabled);
  const includes = active.filter((f) => f.mode === 'include');
  const excludes = active.filter((f) => f.mode === 'exclude');

  if (!ctx) {
    return includes.length === 0
      ? { passed: true, reason: 'no company identified, and no include filters are set' }
      : { passed: false, reason: 'no company identified, so include filters cannot be checked' };
  }

  for (const f of excludes) {
    if (matches(f, ctx)) {
      return { passed: false, reason: `excluded by ${describeFilter(f)}` };
    }
  }

  const kinds = new Set(includes.map((f) => f.kind));
  for (const kind of kinds) {
    const ofKind = includes.filter((f) => f.kind === kind);
    if (!ofKind.some((f) => matches(f, ctx))) {
      return {
        passed: false,
        reason: `no ${kind} filter matched (${ofKind.map(describeFilter).join(', ')})`,
      };
    }
  }

  return {
    passed: true,
    reason: includes.length ? `passed ${includes.length} include filter(s)` : 'no filters set',
  };
}

export function describeFilter(f: Filter): string {
  if (f.kind === 'market_cap') {
    const fmt = (v: number | null) =>
      v === null ? '∞' : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;
    return `market cap ${fmt(f.minValue)}–${fmt(f.maxValue)}`;
  }
  return `${f.kind}="${f.value}"`;
}

/** Convenience presets the chat agent and dashboard can offer by name. */
export const MARKET_CAP_PRESETS: Record<string, { min: number | null; max: number | null }> = {
  nano: { min: null, max: 50e6 },
  micro: { min: 50e6, max: 300e6 },
  small: { min: 300e6, max: 2e9 },
  mid: { min: 2e9, max: 10e9 },
  large: { min: 10e9, max: 200e9 },
  mega: { min: 200e9, max: null },
};

export const TEXT_FILTER_KINDS = TEXT_KINDS;
