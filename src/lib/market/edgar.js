import { secFetchJson, TTL, secData } from '@/lib/sec/client';
import { padCik } from '@/lib/sec/companies';
import { defineProvider } from './provider';
import { STATEMENTS, DERIVED } from './concepts';

/**
 * Fundamentals from SEC's XBRL company-facts API — the numbers companies
 * actually reported, straight from their filings. Free, no key, and the only
 * source here that cannot disagree with the filing it came from.
 *
 * It has no prices, no consensus and no market cap; those capabilities belong
 * to a market data provider.
 */

function factsUrl(cik) {
  return `${secData()}/api/xbrl/companyfacts/CIK${padCik(cik)}.json`;
}

const DAY_MS = 86400000;

function days(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/**
 * Picks the unit series for a concept. Almost everything is USD; EPS is
 * USD/shares and share counts are plain shares.
 */
function unitEntries(fact, preferred) {
  if (!fact?.units) return [];
  const order = preferred ? [preferred] : [];
  order.push('USD', 'USD/shares', 'shares', 'pure');
  for (const unit of order) {
    if (Array.isArray(fact.units[unit]) && fact.units[unit].length) return fact.units[unit];
  }
  const first = Object.values(fact.units).find((v) => Array.isArray(v) && v.length);
  return first || [];
}

/**
 * Selects the entries matching a reporting frequency.
 *
 * Duration facts (revenue, cash flow) carry start and end; instant facts
 * (balance sheet) carry only end. An annual duration is ~365 days and a
 * quarterly one ~91 — filers are not exact, so the windows are generous.
 */
function matchesFrequency(entry, frequency, instant) {
  if (instant || !entry.start) {
    return frequency === 'annual' ? entry.form === '10-K' : true;
  }
  const span = days(entry.start, entry.end);
  return frequency === 'annual' ? span >= 340 && span <= 400 : span >= 75 && span <= 115;
}

/**
 * Collapses entries to one value per period end.
 *
 * The same period is republished in later filings after restatement. The most
 * recently filed value wins, so the series reflects the company's current view
 * of its own history rather than a mix of vintages.
 */
function byPeriodEnd(entries) {
  const best = new Map();
  for (const entry of entries) {
    if (entry.val == null || !entry.end) continue;
    const existing = best.get(entry.end);
    if (!existing || String(entry.filed) > String(existing.filed)) best.set(entry.end, entry);
  }
  return best;
}

export function buildStatements(facts, { frequency = 'annual', limit = 12 } = {}) {
  const gaap = facts?.facts?.['us-gaap'] || {};
  const dei = facts?.facts?.dei || {};

  const columns = new Map(); // period end -> { meta, values }
  const resolved = {}; // line key -> the concept that actually had data

  for (const statement of STATEMENTS) {
    for (const line of statement.lines) {
      let entries = [];
      for (const concept of line.concepts) {
        const fact = gaap[concept] || dei[concept];
        if (!fact) continue;
        const candidates = unitEntries(fact, line.unit).filter((e) =>
          matchesFrequency(e, frequency, statement.instant)
        );
        if (candidates.length) {
          entries = candidates;
          resolved[line.key] = concept;
          break;
        }
      }
      if (!entries.length) continue;

      // Values come from the most recently filed entry; period identity comes
      // from the earliest. A figure republished after a restatement carries the
      // LATER filing's fiscal-year context, so taking `fy` from it would label
      // FY2024 as FY2025 — duplicating a label and breaking the fiscal-year
      // join to street estimates.
      const latest = byPeriodEnd(entries);
      for (const entry of entries) {
        if (entry.val == null || !entry.end) continue;
        const column = columns.get(entry.end);
        if (!column) {
          columns.set(entry.end, {
            end: entry.end,
            fy: entry.fy ?? null,
            fp: entry.fp ?? null,
            form: entry.form ?? null,
            filed: entry.filed ?? null,
            accession: entry.accn ?? null,
            values: {},
          });
        } else if (entry.filed && (!column.filed || String(entry.filed) < String(column.filed))) {
          column.fy = entry.fy ?? column.fy;
          column.fp = entry.fp ?? column.fp;
          column.form = entry.form ?? column.form;
          column.filed = entry.filed;
          column.accession = entry.accn ?? column.accession;
        }
      }
      for (const [end, entry] of latest) {
        columns.get(end).values[line.key] = entry.val;
      }
    }
  }

  let periods = [...columns.values()].sort((a, b) => (a.end < b.end ? 1 : -1)).slice(0, limit);

  // Fill in derived lines that the filer did not tag directly.
  for (const period of periods) {
    const v = period.values;
    if (v.grossProfit == null && v.revenue != null && v.costOfRevenue != null) {
      v.grossProfit = v.revenue - v.costOfRevenue;
    }
    period.derived = {};
    for (const metric of DERIVED) {
      period.derived[metric.key] = metric.compute(v);
    }
    period.label =
      frequency === 'annual'
        ? `FY${period.fy ?? period.end.slice(0, 4)}`
        : `${period.fp || ''} ${period.fy ?? period.end.slice(0, 4)}`.trim();
  }

  return { periods: periods.reverse(), resolved };
}

async function fundamentals(cik, { frequency = 'annual', limit = 12 } = {}) {
  const facts = await secFetchJson(factsUrl(cik), { maxAgeMs: TTL.DAY });
  const { periods, resolved } = buildStatements(facts, { frequency, limit });
  return {
    source: 'edgar',
    entityName: facts?.entityName || '',
    frequency,
    periods,
    resolved,
  };
}

export const edgarProvider = defineProvider({
  id: 'edgar',
  label: 'SEC EDGAR (XBRL company facts)',
  docsUrl: 'https://www.sec.gov/edgar/sec-api-documentation',
  envKey: 'SEC_USER_AGENT',
  capabilities: ['fundamentals'],
  configured: () => Boolean(process.env['SEC_USER_AGENT']),
  fundamentals,
});
