import { percentileRank, median } from './model';

/**
 * Analysis that combines reported fundamentals with price history.
 *
 * Everything here degrades: with fundamentals only you still get growth, margins
 * and estimate comparisons; price-dependent panels return null and the UI says
 * which provider would fill them.
 */

/** Index price closes by date for O(1) lookup, with a sorted date list. */
function priceIndex(closes) {
  const byDate = new Map();
  const dates = [];
  for (const row of closes || []) {
    if (!row?.date || row.close == null) continue;
    byDate.set(row.date, row.close);
    dates.push(row.date);
  }
  dates.sort();
  return { byDate, dates };
}

/** Closest trading day at or before `date`. */
function onOrBefore({ byDate, dates }, date) {
  if (!dates.length) return null;
  let lo = 0;
  let hi = dates.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= date) {
      found = dates[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found ? { date: found, close: byDate.get(found) } : null;
}

/** Closest trading day at or after `date`. */
function onOrAfter({ byDate, dates }, date) {
  if (!dates.length) return null;
  let lo = 0;
  let hi = dates.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] >= date) {
      found = dates[mid];
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return found ? { date: found, close: byDate.get(found) } : null;
}

/** Last trading day strictly before `date`. */
function strictlyBefore({ byDate, dates }, date) {
  if (!dates.length) return null;
  let lo = 0;
  let hi = dates.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < date) {
      found = dates[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found ? { date: found, close: byDate.get(found) } : null;
}

function shift(index, date, tradingDays) {
  const { dates, byDate } = index;
  const at = onOrAfter(index, date);
  if (!at) return null;
  const position = dates.indexOf(at.date) + tradingDays;
  if (position < 0 || position >= dates.length) return null;
  return { date: dates[position], close: byDate.get(dates[position]) };
}

/**
 * How the stock traded around each earnings filing.
 *
 * The filing date is the anchor rather than a vendor's "earnings date" because
 * it comes from the same EDGAR feed as everything else and cannot drift out of
 * sync with the documents shown elsewhere in the app.
 */
export function earningsReactions(closes, filings, { limit = 12 } = {}) {
  const index = priceIndex(closes);
  if (!index.dates.length) return [];

  const reports = (filings || [])
    .filter((f) => /^10-[KQ]/.test(f.form))
    .sort((a, b) => (a.filingDate < b.filingDate ? 1 : -1))
    .slice(0, limit);

  const rows = [];
  for (const filing of reports) {
    // Strictly before the filing date. Using the filing day's own close would
    // hide the move, because a report filed pre-market is already in that
    // close — the reaction would measure the day after against the day of.
    const before = strictlyBefore(index, filing.filingDate);
    const after = shift(index, filing.filingDate, 0);
    const fiveDay = shift(index, filing.filingDate, 4);
    if (!before || !after) continue;

    rows.push({
      accession: filing.accession,
      accessionPlain: filing.accessionPlain,
      form: filing.form,
      filingDate: filing.filingDate,
      reportDate: filing.reportDate,
      priceBefore: before.close,
      priceAfter: after.close,
      oneDay: before.close ? (after.close - before.close) / before.close : null,
      fiveDay: fiveDay && before.close ? (fiveDay.close - before.close) / before.close : null,
    });
  }

  return rows.reverse();
}

/**
 * Trailing-twelve-month series from quarterly periods. A TTM figure needs four
 * consecutive quarters; periods with a gap are skipped rather than summed into
 * a misleading number.
 */
export function ttmSeries(quarters, key) {
  const rows = [];
  for (let i = 3; i < quarters.length; i++) {
    const window = quarters.slice(i - 3, i + 1);
    const values = window.map((p) => p.values?.[key] ?? p.derived?.[key]);
    if (values.some((v) => v == null)) continue;
    rows.push({ end: quarters[i].end, value: values.reduce((sum, v) => sum + v, 0) });
  }
  return rows;
}

/**
 * Valuation multiples over time, and where today sits in that range.
 *
 * This is the "relative to its own history" read: a 14x multiple means nothing
 * until you know the name has traded 9x-22x over the period.
 */
export function valuationHistory(closes, quarters, { sharesKey = 'dilutedShares' } = {}) {
  const index = priceIndex(closes);
  if (!index.dates.length || !quarters?.length) return null;

  const epsTtm = ttmSeries(quarters, 'epsDiluted');
  const revenueTtm = ttmSeries(quarters, 'revenue');

  const sharesByEnd = new Map(
    quarters.map((p) => [p.end, p.values?.[sharesKey] ?? null]).filter(([, v]) => v != null)
  );

  const pickAsOf = (series, date) => {
    let chosen = null;
    for (const row of series) {
      if (row.end <= date) chosen = row;
      else break;
    }
    return chosen;
  };

  // Weekly sampling keeps the series small enough to chart without losing shape.
  const points = [];
  for (let i = 0; i < index.dates.length; i += 5) {
    const date = index.dates[i];
    const close = index.byDate.get(date);
    const eps = pickAsOf(epsTtm, date);
    const revenue = pickAsOf(revenueTtm, date);

    let shares = null;
    for (const [end, value] of sharesByEnd) {
      if (end <= date) shares = value;
    }

    points.push({
      date,
      close,
      pe: eps && eps.value > 0 ? close / eps.value : null,
      ps: revenue && revenue.value > 0 && shares ? close / (revenue.value / shares) : null,
    });
  }

  const summarize = (key) => {
    const values = points.map((p) => p[key]).filter((v) => v != null && Number.isFinite(v) && v > 0);
    if (!values.length) return null;
    const current = [...points].reverse().find((p) => p[key] != null)?.[key] ?? null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      current,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: median(values),
      percentile: percentileRank(values, current),
    };
  };

  return { points, pe: summarize('pe'), ps: summarize('ps') };
}

/**
 * Your forecast against the street's, and against what was actually reported
 * once the year closes. `delta` is your number versus consensus — the number
 * that says whether you are differentiated or just along for the ride.
 */
export function estimateComparison({ myEstimates = [], street = [], actuals = [] }) {
  const years = new Set();
  for (const e of myEstimates) if (e.fy != null) years.add(Number(e.fy));
  for (const e of street) if (e.fy != null) years.add(Number(e.fy));
  for (const p of actuals) if (p.fy != null) years.add(Number(p.fy));

  const streetByFy = new Map(street.map((e) => [Number(e.fy), e]));
  const mineByFy = new Map(myEstimates.map((e) => [Number(e.fy), e]));
  const actualByFy = new Map(
    actuals.filter((p) => p.fy != null).map((p) => [Number(p.fy), p])
  );

  const delta = (mine, theirs) =>
    mine == null || theirs == null || theirs === 0 ? null : (mine - theirs) / Math.abs(theirs);

  return [...years]
    .sort((a, b) => a - b)
    .map((fy) => {
      const mine = mineByFy.get(fy) || {};
      const theirs = streetByFy.get(fy) || {};
      const actual = actualByFy.get(fy);

      return {
        fy,
        mine: { revenue: mine.revenue ?? null, eps: mine.eps ?? null, ebitda: mine.ebitda ?? null, note: mine.note || '' },
        street: {
          revenue: theirs.revenue ?? null,
          eps: theirs.eps ?? null,
          ebitda: theirs.ebitda ?? null,
          analysts: theirs.analysts ?? null,
        },
        actual: actual
          ? { revenue: actual.values?.revenue ?? null, eps: actual.values?.epsDiluted ?? null }
          : null,
        delta: {
          revenue: delta(mine.revenue, theirs.revenue),
          eps: delta(mine.eps, theirs.eps),
        },
        // Once a year is reported, who was closer.
        scored: actual
          ? {
              mineEpsError: mine.eps != null && actual.values?.epsDiluted != null
                ? Math.abs(mine.eps - actual.values.epsDiluted)
                : null,
              streetEpsError: theirs.eps != null && actual.values?.epsDiluted != null
                ? Math.abs(theirs.eps - actual.values.epsDiluted)
                : null,
            }
          : null,
      };
    });
}
