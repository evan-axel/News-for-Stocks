import { createStore, newId } from '@/lib/jsonStore';
import { SECTORS, RATINGS, STATUSES } from './model';

const store = createStore('coverage.json');

function clean(value) {
  return String(value ?? '').trim();
}

function numOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalize(input, existing = {}) {
  const sector = SECTORS.includes(input.sector) ? input.sector : existing.sector || 'Uncategorized';
  const rating = RATINGS[input.rating] ? input.rating : existing.rating || 'watch';
  const status = STATUSES[input.status] ? input.status : existing.status || 'active';

  return {
    ticker: clean(input.ticker ?? existing.ticker).toUpperCase(),
    cik: clean(input.cik ?? existing.cik),
    name: clean(input.name ?? existing.name),
    sector,
    subSector: clean(input.subSector ?? existing.subSector),
    rating,
    status,
    conviction: numOrNull(input.conviction ?? existing.conviction),
    targetPrice: numOrNull(input.targetPrice ?? existing.targetPrice),
    kpis: Array.isArray(input.kpis) ? input.kpis.filter(Boolean) : existing.kpis || [],
    notes: clean(input.notes ?? existing.notes),
  };
}

export async function listCoverage() {
  const rows = await store.readAll();
  return rows.sort((a, b) => a.sector.localeCompare(b.sector) || a.ticker.localeCompare(b.ticker));
}

export async function getCoverage(id) {
  const rows = await store.readAll();
  return rows.find((r) => r.id === id || r.ticker === String(id).toUpperCase()) || null;
}

export function addCoverage(input) {
  const fields = normalize(input);
  if (!fields.ticker) throw new Error('Ticker is required.');
  if (!fields.cik) throw new Error('CIK is required — pick the company from search so filings resolve.');

  const now = new Date().toISOString();
  return store.transact(async (rows) => {
    if (rows.some((r) => r.ticker === fields.ticker)) {
      throw new Error(`${fields.ticker} is already in your coverage.`);
    }
    const row = {
      id: newId('cov'),
      ...fields,
      myEstimates: [],
      catalysts: [],
      addedAt: now,
      updatedAt: now,
    };
    rows.push(row);
    return { rows, result: row };
  });
}

function mutate(id, fn) {
  return store.transact(async (rows) => {
    const index = rows.findIndex((r) => r.id === id);
    if (index === -1) throw new Error('Name not found in coverage.');
    const next = fn({ ...rows[index] });
    next.updatedAt = new Date().toISOString();
    rows[index] = next;
    return { rows, result: next };
  });
}

export function updateCoverage(id, input) {
  return mutate(id, (row) => ({ ...row, ...normalize(input, row) }));
}

export function removeCoverage(id) {
  return store.transact(async (rows) => {
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length) throw new Error('Name not found in coverage.');
    return { rows: next, result: { removed: id } };
  });
}

/**
 * Your own forecast for a fiscal year. Stored per name so the dashboard can put
 * it beside the street number and beside what the company actually reported.
 */
export function setEstimate(id, estimate) {
  const fy = Number(estimate.fy);
  if (!Number.isFinite(fy)) throw new Error('A fiscal year is required.');

  return mutate(id, (row) => {
    const entry = {
      fy,
      revenue: numOrNull(estimate.revenue),
      eps: numOrNull(estimate.eps),
      ebitda: numOrNull(estimate.ebitda),
      note: clean(estimate.note),
      updatedAt: new Date().toISOString(),
    };
    const rest = (row.myEstimates || []).filter((e) => e.fy !== fy);
    return { ...row, myEstimates: [...rest, entry].sort((a, b) => a.fy - b.fy) };
  });
}

export function removeEstimate(id, fy) {
  return mutate(id, (row) => ({
    ...row,
    myEstimates: (row.myEstimates || []).filter((e) => e.fy !== Number(fy)),
  }));
}

export function addCatalyst(id, catalyst) {
  const date = clean(catalyst.date);
  const label = clean(catalyst.label);
  if (!date || !label) throw new Error('A catalyst needs a date and a label.');

  return mutate(id, (row) => ({
    ...row,
    catalysts: [
      ...(row.catalysts || []),
      {
        id: newId('cat'),
        date,
        label,
        kind: clean(catalyst.kind) || 'other',
        done: false,
      },
    ].sort((a, b) => (a.date < b.date ? -1 : 1)),
  }));
}

export function updateCatalyst(id, catalystId, patch) {
  return mutate(id, (row) => ({
    ...row,
    catalysts: (row.catalysts || []).map((c) =>
      c.id === catalystId ? { ...c, ...patch, id: c.id } : c
    ),
  }));
}

export function removeCatalyst(id, catalystId) {
  return mutate(id, (row) => ({
    ...row,
    catalysts: (row.catalysts || []).filter((c) => c.id !== catalystId),
  }));
}
