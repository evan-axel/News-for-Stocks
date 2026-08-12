'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Filter as FilterIcon,
  Plus,
  RefreshCw,
  Rss,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

const MARKET_CAP_PRESETS = ['nano', 'micro', 'small', 'mid', 'large', 'mega'];
const FILTER_KINDS = ['industry', 'sector', 'market_cap', 'exchange', 'country', 'ticker'];

function Card({ title, icon: Icon, children, action }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Icon className="h-4 w-4" />
          {title}
        </h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const STATUS_STYLES = {
  sent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  suppressed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  failed: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
};

export default function Dashboard() {
  const [state, setState] = useState({
    overview: null,
    alerts: [],
    keywords: [],
    filters: [],
    sources: [],
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [filterDraft, setFilterDraft] = useState({ kind: 'industry', value: '', mode: 'include' });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [overview, alerts, keywords, filtersRes, sources] = await Promise.all([
        api.overview(),
        api.alerts(50),
        api.keywords(),
        api.filters(),
        api.sources(),
      ]);
      setState({ overview, alerts, keywords, filters: filtersRes.filters ?? [], sources });
    } catch (err) {
      setError(
        `${err.message}. Is the worker running, and is NEXT_PUBLIC_WORKER_URL pointing at it?`,
      );
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const { overview } = state;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">News for Stocks</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Control panel. Everything here can also be changed by texting the bot — this page is
            just a wider view of the same settings.
          </p>
        </div>
        <button
          onClick={() => run(api.scanNow)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          Scan now
        </button>
      </header>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg bg-rose-50 p-4 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {overview && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Status', value: overview.paused ? 'Paused' : 'Live' },
            { label: 'Keywords', value: overview.keywords },
            { label: 'Filters', value: overview.filters },
            { label: 'Scan interval', value: `${Math.round(overview.scanIntervalSeconds / 60)} min` },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="text-xs uppercase tracking-wide text-slate-500">{s.label}</div>
              <div className="mt-1 text-xl font-semibold">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Keywords — what triggers an alert" icon={Tag}>
          <form
            className="mb-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newKeyword.trim()) return;
              run(async () => {
                await api.addKeyword(newKeyword.trim(), []);
                setNewKeyword('');
              });
            }}
          >
            <input
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="e.g. going private"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              <Plus className="h-4 w-4" />
            </button>
          </form>

          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {state.keywords.map((k) => (
              <li
                key={k.term}
                className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span>
                  {k.term}
                  {k.synonyms?.length > 0 && (
                    <span className="ml-2 text-xs text-slate-400">+{k.synonyms.length} variants</span>
                  )}
                </span>
                <button
                  onClick={() => run(() => api.removeKeyword(k.term))}
                  className="text-slate-400 hover:text-rose-600"
                  aria-label={`Remove ${k.term}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {state.keywords.length === 0 && (
              <li className="px-2 py-4 text-slate-500">
                No keywords yet — run <code>npm run seed</code> for the default pack.
              </li>
            )}
          </ul>
        </Card>

        <Card title="Filters — whose news gets through" icon={FilterIcon}>
          <form
            className="mb-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const payload = { kind: filterDraft.kind, mode: filterDraft.mode };
              if (filterDraft.kind === 'market_cap') {
                const preset = filterDraft.value;
                const bounds = {
                  nano: [null, 50e6],
                  micro: [50e6, 300e6],
                  small: [300e6, 2e9],
                  mid: [2e9, 10e9],
                  large: [10e9, 200e9],
                  mega: [200e9, null],
                }[preset];
                if (!bounds) return;
                payload.minValue = bounds[0];
                payload.maxValue = bounds[1];
              } else {
                if (!filterDraft.value.trim()) return;
                payload.value = filterDraft.value.trim();
              }
              run(async () => {
                await api.addFilter(payload);
                setFilterDraft({ ...filterDraft, value: '' });
              });
            }}
          >
            <div className="flex gap-2">
              <select
                value={filterDraft.kind}
                onChange={(e) => setFilterDraft({ ...filterDraft, kind: e.target.value, value: '' })}
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {FILTER_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>

              {filterDraft.kind === 'market_cap' ? (
                <select
                  value={filterDraft.value}
                  onChange={(e) => setFilterDraft({ ...filterDraft, value: e.target.value })}
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">choose a size…</option>
                  {MARKET_CAP_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={filterDraft.value}
                  onChange={(e) => setFilterDraft({ ...filterDraft, value: e.target.value })}
                  placeholder="e.g. Biotechnology"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              )}

              <select
                value={filterDraft.mode}
                onChange={(e) => setFilterDraft({ ...filterDraft, mode: e.target.value })}
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="include">include</option>
                <option value="exclude">exclude</option>
              </select>

              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </form>

          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {state.filters.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span>
                  <span
                    className={`mr-2 rounded px-1.5 py-0.5 text-xs ${
                      f.mode === 'exclude'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    }`}
                  >
                    {f.mode}
                  </span>
                  {f.kind}
                  {f.value ? `: ${f.value}` : ''}
                  {f.kind === 'market_cap' &&
                    ` : ${f.minValue ? `$${(f.minValue / 1e6).toFixed(0)}M` : '0'}–${
                      f.maxValue ? `$${(f.maxValue / 1e9).toFixed(1)}B` : '∞'
                    }`}
                </span>
                <button
                  onClick={() => run(() => api.removeFilter(f.id))}
                  className="text-slate-400 hover:text-rose-600"
                  aria-label={`Remove filter ${f.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {state.filters.length === 0 && (
              <li className="px-2 py-4 text-slate-500">
                No filters — every company passes. Add one to narrow to an industry or size band.
              </li>
            )}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6">
        <Card title="Recent alerts" icon={AlertCircle}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {state.alerts.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLES[a.status] ?? ''}`}>
                    {a.status}
                  </span>
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                    {a.keywordTerm}
                  </span>
                  {a.ticker && <span className="font-mono font-semibold">{a.ticker}</span>}
                  <span className="text-slate-400">
                    {new Date(a.publishedAt).toLocaleString()} · {a.sourceName}
                  </span>
                </div>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  {a.title}
                </a>
                {a.error && <p className="mt-1 text-xs text-slate-500">{a.error}</p>}
              </li>
            ))}
            {state.alerts.length === 0 && (
              <li className="py-4 text-sm text-slate-500">Nothing yet.</li>
            )}
          </ul>
        </Card>

        <Card title="Source health" icon={Rss}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Source</th>
                  <th className="py-2 pr-4">Items last run</th>
                  <th className="py-2 pr-4">Consecutive failures</th>
                  <th className="py-2">Last error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {state.sources.map((s) => (
                  <tr key={s.source_id}>
                    <td className="py-2 pr-4 font-mono text-xs">{s.source_id}</td>
                    <td className="py-2 pr-4">{s.items_last_run}</td>
                    <td
                      className={`py-2 pr-4 ${
                        s.consecutive_failures > 0 ? 'font-semibold text-rose-600' : ''
                      }`}
                    >
                      {s.consecutive_failures}
                    </td>
                    <td className="py-2 text-xs text-slate-500">{s.last_error ?? ''}</td>
                  </tr>
                ))}
                {state.sources.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-slate-500">
                      No scan has run yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}
