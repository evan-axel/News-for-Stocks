import { CAPABILITIES } from './provider';
import { edgarProvider } from './edgar';
import { fmpProvider } from './fmp';

/**
 * Provider registry. Order is preference order: the first provider that both
 * declares a capability and reports itself configured serves it.
 *
 * To add a vendor, write an adapter returning the normalized shapes and list it
 * here. No panel changes.
 */
export const PROVIDERS = [edgarProvider, fmpProvider];

export function providerFor(capability) {
  return PROVIDERS.find((p) => p.capabilities.includes(capability) && p.configured()) || null;
}

/**
 * What the dashboard can actually show right now. Panels use this to render an
 * honest empty state naming the missing key rather than a broken chart.
 */
export function capabilityStatus() {
  const status = {};
  for (const capability of CAPABILITIES) {
    const active = providerFor(capability);
    const candidates = PROVIDERS.filter((p) => p.capabilities.includes(capability));
    status[capability] = {
      available: Boolean(active),
      provider: active ? { id: active.id, label: active.label } : null,
      candidates: candidates.map((p) => ({
        id: p.id,
        label: p.label,
        envKey: p.envKey,
        docsUrl: p.docsUrl,
        configured: p.configured(),
      })),
    };
  }
  return status;
}

/**
 * Calls a capability, returning `{ ok, data }` or `{ ok: false, reason }`.
 * Never throws for a missing provider — an unconfigured vendor is an expected
 * state here, not an error.
 */
export async function callCapability(capability, ...args) {
  const provider = providerFor(capability);
  if (!provider) {
    const candidates = PROVIDERS.filter((p) => p.capabilities.includes(capability));
    return {
      ok: false,
      reason: 'no-provider',
      message: candidates.length
        ? `No provider configured for ${capability}. Set ${candidates
            .map((p) => p.envKey)
            .filter(Boolean)
            .join(' or ')}.`
        : `No provider implements ${capability}.`,
      candidates: candidates.map((p) => ({ id: p.id, label: p.label, envKey: p.envKey })),
    };
  }

  try {
    const data = await provider[capability](...args);
    return { ok: true, provider: provider.id, data };
  } catch (error) {
    return { ok: false, reason: 'provider-error', provider: provider.id, message: error.message };
  }
}
