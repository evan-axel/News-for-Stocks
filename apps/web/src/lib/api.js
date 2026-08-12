/**
 * Thin client for the worker's dashboard API.
 *
 * The token is a browser-visible env var by design: this panel is meant to run
 * on your own machine or behind your own auth. Do not expose it publicly with a
 * token you care about.
 */
const BASE = process.env.NEXT_PUBLIC_WORKER_URL ?? 'http://localhost:8080';
const TOKEN = process.env.NEXT_PUBLIC_DASHBOARD_API_TOKEN ?? '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(TOKEN ? { 'x-api-token': TOKEN } : {}),
      ...(options.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  overview: () => request('/overview'),
  alerts: (limit = 50) => request(`/alerts?limit=${limit}`),
  keywords: () => request('/keywords'),
  addKeyword: (term, synonyms) =>
    request('/keywords', { method: 'POST', body: JSON.stringify({ term, synonyms }) }),
  removeKeyword: (term) => request(`/keywords/${encodeURIComponent(term)}`, { method: 'DELETE' }),
  filters: () => request('/filters'),
  addFilter: (payload) => request('/filters', { method: 'POST', body: JSON.stringify(payload) }),
  removeFilter: (id) => request(`/filters/${id}`, { method: 'DELETE' }),
  sources: () => request('/sources'),
  scanNow: () => request('/scan', { method: 'POST' }),
};
