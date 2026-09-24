/**
 * Market data provider interface.
 *
 * Nothing in the dashboard talks to a vendor directly. Each provider declares
 * which capabilities it actually serves, and panels ask the registry for a
 * capability rather than for a vendor — so a panel degrades to "no provider
 * configured" instead of breaking when a key is missing.
 *
 * Capabilities:
 *   fundamentals   reported income statement / balance sheet / cash flow
 *   quote          last price and change
 *   priceHistory   daily closes
 *   estimates      street consensus (revenue / EPS by period)
 *   profile        sector, industry, share count, market cap
 */

export const CAPABILITIES = [
  'fundamentals',
  'quote',
  'priceHistory',
  'estimates',
  'profile',
];

/**
 * A provider is a plain object:
 *   { id, label, capabilities: [...], configured(): bool, ...methods }
 *
 * Methods are optional; the registry only routes to a provider that both
 * declares the capability and reports itself configured.
 */
export function defineProvider(spec) {
  const missing = (spec.capabilities || []).filter((c) => typeof spec[c] !== 'function');
  if (missing.length) {
    throw new Error(
      `Provider "${spec.id}" declares [${missing.join(', ')}] but does not implement them.`
    );
  }
  return {
    id: spec.id,
    label: spec.label,
    docsUrl: spec.docsUrl || null,
    envKey: spec.envKey || null,
    capabilities: spec.capabilities || [],
    configured: spec.configured || (() => true),
    ...spec,
  };
}

/** Normalized shapes every adapter must return, documented as builders. */

export function period({ label, end, fy, fp, form, accession }) {
  return { label, end, fy: fy ?? null, fp: fp ?? null, form: form ?? null, accession: accession ?? null };
}

export function series(name, values) {
  return { name, values };
}
