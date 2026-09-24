'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { LineChart, DivergingBars, Columns, Sparkline } from '@/components/charts';
import { STATEMENTS, DERIVED } from '@/lib/market/concepts';
import { CATALYST_KINDS, money, percent, formatKpi, yoy, kpiMeta } from '@/lib/coverage/model';
import { setEstimateAction, removeEstimateAction, addCatalystAction, removeCatalystAction } from '../actions';

export function Missing({ capability, capabilities, what }) {
  const status = capabilities?.[capability];
  const candidates = status?.candidates || [];
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-slate-400" />
      <div>
        <p className="font-medium text-slate-800">{what} needs a {capability} provider.</p>
        {candidates.length > 0 && (
          <p className="mt-1">
            Set{' '}
            {candidates.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ' or '}
                <code className="rounded bg-slate-200 px-1">{c.envKey}</code>
              </span>
            ))}{' '}
            in <code className="rounded bg-slate-200 px-1">.env</code>.
          </p>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, series, tone }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone || 'text-slate-900'}`}>{value}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-xs text-slate-500">{sub}</span>
        {series && series.length > 2 && <Sparkline values={series} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ snapshot

export function Snapshot({ data, coverage }) {
  const annual = data.fundamentals?.annual?.periods || [];
  const quarters = data.fundamentals?.quarterly?.periods || [];
  const latest = annual[annual.length - 1];
  const quote = data.quote;

  const kpiKeys = coverage.kpis?.length
    ? coverage.kpis
    : ['revenue', 'grossMargin', 'operatingMargin', 'freeCashFlow'];

  const seriesFor = (key) =>
    annual.map((p) => p.values?.[key] ?? p.derived?.[key] ?? null).filter((v) => v != null);

  const kindFor = (key) => {
    if (DERIVED.find((d) => d.key === key)?.percent) return 'percent';
    if (key === 'epsDiluted') return 'perShare';
    return 'currency';
  };

  const upcoming = (coverage.catalysts || [])
    .filter((c) => !c.done && c.date >= new Date().toISOString().slice(0, 10))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quote ? (
          <>
            <Tile
              label="Price"
              value={quote.price != null ? `$${quote.price.toFixed(2)}` : '—'}
              sub={
                quote.changePercent != null
                  ? `${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}% today`
                  : ''
              }
              tone={quote.changePercent >= 0 ? 'text-emerald-700' : 'text-red-700'}
            />
            <Tile label="Market cap" value={money(quote.marketCap)} sub={quote.exchange || ''} />
          </>
        ) : (
          <div className="sm:col-span-2">
            <Missing capability="quote" capabilities={data.capabilities} what="Price and market cap" />
          </div>
        )}

        {data.valuation?.pe && (
          <Tile
            label="P/E vs own history"
            value={data.valuation.pe.current ? `${data.valuation.pe.current.toFixed(1)}x` : '—'}
            sub={
              data.valuation.pe.percentile != null
                ? `${Math.round(data.valuation.pe.percentile * 100)}th pct · median ${data.valuation.pe.median?.toFixed(1)}x`
                : ''
            }
          />
        )}

        {latest && (
          <Tile
            label={`Revenue ${latest.label}`}
            value={money(latest.values?.revenue)}
            sub={yoy(annual, 'revenue') != null ? `${percent(yoy(annual, 'revenue'), { decimals: 1 })} YoY` : ''}
            series={seriesFor('revenue')}
          />
        )}
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Tracked metrics</h3>
        {annual.length === 0 ? (
          <div className="card p-4 text-sm text-slate-500">
            No XBRL fundamentals returned for this filer. Smaller or foreign filers sometimes tag
            too little for the standard concepts.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpiKeys.map((key) => {
              const value = latest?.values?.[key] ?? latest?.derived?.[key] ?? null;
              const change = yoy(annual, key);
              return (
                <Tile
                  key={key}
                  label={kpiMeta(key).label}
                  value={formatKpi(value, kindFor(key))}
                  sub={change != null ? `${percent(change, { decimals: 1 })} YoY` : latest?.label || ''}
                  series={seriesFor(key)}
                />
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Reaction to the last earnings filings</h3>
          <span className="text-xs text-slate-500">1-day move from the close before the filing</span>
        </div>
        <div className="card p-4">
          {data.reactions?.length ? (
            <DivergingBars
              label="One-day price reaction to each 10-Q or 10-K filing"
              rows={data.reactions.map((r) => ({
                key: r.accession,
                label: r.reportDate?.slice(0, 7) || r.filingDate.slice(0, 7),
                value: r.oneDay,
                tooltip: `${r.form} filed ${r.filingDate}`,
              }))}
            />
          ) : (
            <Missing capability="priceHistory" capabilities={data.capabilities} what="Earnings reaction" />
          )}
        </div>
      </section>

      {upcoming.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Next catalysts</h3>
          <div className="card divide-y divide-slate-100">
            {upcoming.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-slate-500">{c.date}</span>
                <span className="pill bg-slate-100 text-slate-600">{CATALYST_KINDS[c.kind] || c.kind}</span>
                <span className="text-slate-800">{c.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- financials

export function Financials({ data }) {
  const [frequency, setFrequency] = useState('annual');
  const source = frequency === 'annual' ? data.fundamentals?.annual : data.fundamentals?.quarterly;
  const periods = source?.periods || [];

  if (!periods.length) {
    return (
      <div className="card p-6 text-sm text-slate-600">
        No XBRL facts returned for this filer.
        {data.fundamentals?.error ? ` (${data.fundamentals.error})` : ''}
      </div>
    );
  }

  const revenueRows = periods.map((p) => ({ key: p.end, label: p.label, value: p.values?.revenue ?? null }));
  const marginRows = periods
    .map((p) => ({ date: p.label, value: p.derived?.grossMargin ?? null }))
    .filter((r) => r.value != null);

  return (
    <div className="space-y-6">
      <div className="flex gap-1">
        {['annual', 'quarterly'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFrequency(f)}
            className={`pill border ${
              frequency === f ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {f === 'annual' ? 'Annual' : 'Quarterly'}
          </button>
        ))}
      </div>

      {/* Two measures of different scale get two charts, never two y-axes. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Revenue</h3>
          <Columns rows={revenueRows.slice(-8)} format={(v) => money(v, { decimals: 1 })} label="Revenue by period" />
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Gross margin</h3>
          {marginRows.length > 1 ? (
            <LineChart
              points={marginRows.slice(-16)}
              xKey="date"
              yKey="value"
              format={(v) => `${(v * 100).toFixed(0)}%`}
              formatX={(v) => v}
              label="Gross margin by period"
            />
          ) : (
            <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">
              Gross profit not tagged for enough periods.
            </div>
          )}
        </div>
      </div>

      {STATEMENTS.map((statement) => (
        <section key={statement.id}>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">{statement.label}</h3>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="sticky left-0 bg-white px-4 py-2 text-left font-medium">Line</th>
                  {periods.map((p) => (
                    <th key={p.end} className="px-3 py-2 text-right font-medium tabular-nums">
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((line) => {
                  const cells = periods.map((p) => p.values?.[line.key] ?? null);
                  if (cells.every((c) => c == null)) return null;
                  return (
                    <tr key={line.key} className="border-b border-slate-50 last:border-0">
                      <td className="sticky left-0 bg-white px-4 py-2 text-slate-700">{line.label}</td>
                      {cells.map((value, i) => (
                        <td key={i} className="px-3 py-2 text-right tabular-nums text-slate-800">
                          {line.unit === 'USD/shares'
                            ? value != null
                              ? `$${value.toFixed(2)}`
                              : '—'
                            : line.unit === 'shares'
                              ? value != null
                                ? (value / 1e6).toFixed(1) + 'M'
                                : '—'
                              : money(value)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Derived</h3>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="sticky left-0 bg-white px-4 py-2 text-left font-medium">Metric</th>
                {periods.map((p) => (
                  <th key={p.end} className="px-3 py-2 text-right font-medium tabular-nums">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DERIVED.map((metric) => {
                const cells = periods.map((p) => p.derived?.[metric.key] ?? null);
                if (cells.every((c) => c == null)) return null;
                return (
                  <tr key={metric.key} className="border-b border-slate-50 last:border-0">
                    <td className="sticky left-0 bg-white px-4 py-2 text-slate-700">{metric.label}</td>
                    {cells.map((value, i) => (
                      <td key={i} className="px-3 py-2 text-right tabular-nums text-slate-800">
                        {metric.percent ? percent(value) : money(value)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Reported figures from SEC XBRL company facts. Where a period was later restated, the most
        recently filed value is shown.
      </p>
    </div>
  );
}

// ----------------------------------------------------------------- valuation

/** Enough decimals that adjacent axis ticks never print the same label. */
function multipleFormatter(stats) {
  const span = Math.abs((stats?.max ?? 0) - (stats?.min ?? 0));
  const decimals = span >= 5 ? 1 : span >= 0.5 ? 2 : 3;
  return (v) => `${Number(v).toFixed(decimals)}x`;
}

export function Valuation({ data }) {
  if (!data.valuation) {
    return <Missing capability="priceHistory" capabilities={data.capabilities} what="Valuation history" />;
  }

  const { points, pe, ps } = data.valuation;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { key: 'pe', label: 'P/E (TTM)', stats: pe },
          { key: 'ps', label: 'P/S (TTM)', stats: ps },
        ].map(({ key, label, stats }) =>
          stats ? (
            (() => {
              const fmt = multipleFormatter(stats);
              return (
            <div key={key} className="card p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
                <span className="text-xs text-slate-500">
                  {stats.percentile != null && `${Math.round(stats.percentile * 100)}th percentile of its own range`}
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-2xl font-semibold tabular-nums text-slate-900">
                  {fmt(stats.current)}
                </span>
                <span className="text-xs text-slate-500 tabular-nums">
                  range {fmt(stats.min)}–{fmt(stats.max)} · median {fmt(stats.median)}
                </span>
              </div>
              <div className="mt-3">
                <LineChart
                  points={points.filter((p) => p[key] != null).map((p) => ({ date: p.date, value: p[key] }))}
                  format={fmt}
                  formatX={(v) => String(v).slice(0, 7)}
                  band={{ min: stats.min, max: stats.max, median: stats.median }}
                  label={`${label} over time against its own range`}
                  height={180}
                />
              </div>
            </div>
              );
            })()
          ) : null
        )}
      </div>
      <p className="text-xs text-slate-400">
        Multiples built from reported TTM figures and daily closes, sampled weekly. A multiple is
        only meaningful against its own history — the shaded band is the full observed range.
      </p>
    </div>
  );
}

// ----------------------------------------------------------------- estimates

export function Estimates({ data, coverage, onChanged }) {
  const [draft, setDraft] = useState({ fy: '', revenue: '', eps: '', ebitda: '', note: '' });
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const rows = data.estimates || [];
  const hasStreet = rows.some((r) => r.street.revenue != null || r.street.eps != null);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await setEstimateAction(coverage.id, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft({ fy: '', revenue: '', eps: '', ebitda: '', note: '' });
      router.refresh();
      onChanged?.();
    });
  };

  const delta = (v) =>
    v == null ? (
      <span className="text-slate-300">—</span>
    ) : (
      <span className={v >= 0 ? 'text-emerald-700' : 'text-red-700'}>
        {v >= 0 ? '+' : ''}
        {(v * 100).toFixed(1)}%
      </span>
    );

  return (
    <div className="space-y-6">
      {!hasStreet && (
        <Missing capability="estimates" capabilities={data.capabilities} what="Street consensus" />
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th className="px-4 py-2 text-left font-medium">FY</th>
              <th className="px-3 py-2 text-right font-medium">My revenue</th>
              <th className="px-3 py-2 text-right font-medium">Street revenue</th>
              <th className="px-3 py-2 text-right font-medium">Δ</th>
              <th className="px-3 py-2 text-right font-medium">My EPS</th>
              <th className="px-3 py-2 text-right font-medium">Street EPS</th>
              <th className="px-3 py-2 text-right font-medium">Δ</th>
              <th className="px-3 py-2 text-right font-medium">Actual EPS</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                  No estimates yet. Add your numbers below — the delta against the street is the
                  point.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.fy} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 font-medium tabular-nums text-slate-900">{row.fy}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(row.mine.revenue)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{money(row.street.revenue)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{delta(row.delta.revenue)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {row.mine.eps != null ? `$${row.mine.eps.toFixed(2)}` : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                  {row.street.eps != null ? `$${row.street.eps.toFixed(2)}` : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{delta(row.delta.eps)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                  {row.actual?.eps != null ? `$${row.actual.eps.toFixed(2)}` : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {row.mine.revenue != null || row.mine.eps != null ? (
                    <button
                      type="button"
                      className="text-slate-300 hover:text-red-600"
                      onClick={async () => {
                        await removeEstimateAction(coverage.id, row.fy);
                        router.refresh();
                        onChanged?.();
                      }}
                      aria-label={`Remove my ${row.fy} estimate`}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold text-slate-900">Add or update my estimate</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          {[
            ['fy', 'Fiscal year', 'number'],
            ['revenue', 'Revenue', 'number'],
            ['eps', 'EPS', 'number'],
            ['ebitda', 'EBITDA', 'number'],
          ].map(([key, label, type]) => (
            <div key={key}>
              <label className="label" htmlFor={`est-${key}`}>
                {label}
              </label>
              <input
                id={`est-${key}`}
                className="input mt-1"
                type={type}
                step="any"
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="sm:col-span-1">
            <label className="label" htmlFor="est-note">
              Note
            </label>
            <input
              id="est-note"
              className="input mt-1"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button type="button" className="btn-primary mt-3" disabled={pending || !draft.fy} onClick={save}>
          {pending ? 'Saving…' : 'Save estimate'}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- catalysts

export function Catalysts({ coverage }) {
  const [draft, setDraft] = useState({ date: '', label: '', kind: 'earnings' });
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const rows = [...(coverage.catalysts || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const today = new Date().toISOString().slice(0, 10);

  const add = () => {
    setError(null);
    startTransition(async () => {
      const result = await addCatalystAction(coverage.id, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft({ date: '', label: '', kind: 'earnings' });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="card divide-y divide-slate-100">
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">
            No catalysts logged. Add the dated events that would change the story.
          </p>
        )}
        {rows.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className={`w-24 shrink-0 tabular-nums ${c.date < today ? 'text-slate-400' : 'text-slate-700'}`}>
              {c.date}
            </span>
            <span className="pill bg-slate-100 text-slate-600">{CATALYST_KINDS[c.kind] || c.kind}</span>
            <span className="min-w-0 flex-1 text-slate-800">{c.label}</span>
            {c.date < today && <span className="pill bg-slate-50 text-slate-400">past</span>}
            <button
              type="button"
              className="text-slate-300 hover:text-red-600"
              onClick={async () => {
                await removeCatalystAction(coverage.id, c.id);
                router.refresh();
              }}
              aria-label="Remove catalyst"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="label" htmlFor="cat-date">
              Date
            </label>
            <input
              id="cat-date"
              className="input mt-1"
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="cat-label">
              What happens
            </label>
            <input
              id="cat-label"
              className="input mt-1"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Q3 results / FDA decision / lockup expiry"
            />
          </div>
          <div>
            <label className="label" htmlFor="cat-kind">
              Kind
            </label>
            <select id="cat-kind" className="input mt-1" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              {Object.entries(CATALYST_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button type="button" className="btn-secondary mt-3" disabled={pending || !draft.date || !draft.label} onClick={add}>
          <Plus size={16} />
          {pending ? 'Adding…' : 'Add catalyst'}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- filings

export function Filings({ data, coverage }) {
  const filings = data.filings || [];
  if (!filings.length) return <div className="card p-6 text-sm text-slate-600">No filings returned.</div>;

  return (
    <div className="card divide-y divide-slate-100">
      {filings.map((filing) => (
        <div key={filing.accession} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="pill bg-indigo-50 font-mono text-indigo-700">{filing.form}</span>
              <span className="text-sm text-slate-500 tabular-nums">{filing.filingDate}</span>
              {filing.description && <span className="text-sm text-slate-700">{filing.description}</span>}
            </div>
            {filing.itemLabels?.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {filing.itemLabels.map((item) => (
                  <li key={item} className="pill bg-amber-50 text-amber-800">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link
            href={`/research/${coverage.cik}/${filing.accessionPlain}`}
            className="btn-secondary shrink-0"
            title="Open in the filing reader with summary and Q&A"
          >
            <ExternalLink size={14} />
            Read
          </Link>
        </div>
      ))}
    </div>
  );
}
