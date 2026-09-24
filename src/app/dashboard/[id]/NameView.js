'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { RATINGS, SECTORS, STATUSES } from '@/lib/coverage/model';
import { updateCoverageAction } from '../actions';
import { Snapshot, Financials, Valuation, Estimates, Catalysts, Filings } from './panels';

const TABS = [
  { id: 'snapshot', label: 'Snapshot' },
  { id: 'financials', label: 'Financials' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'estimates', label: 'My numbers vs street' },
  { id: 'catalysts', label: 'Catalysts' },
  { id: 'filings', label: 'Filings' },
];

function Header({ coverage, data, onRefresh, refreshing }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    sector: coverage.sector,
    rating: coverage.rating,
    status: coverage.status,
    targetPrice: coverage.targetPrice ?? '',
  });
  const router = useRouter();

  const save = async () => {
    await updateCoverageAction(coverage.id, draft);
    setEditing(false);
    router.refresh();
  };

  return (
    <header className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold text-slate-900">{coverage.ticker}</h1>
            <span className="text-slate-600">{coverage.name}</span>
            <span className="pill bg-slate-100 text-slate-600">{coverage.sector}</span>
            <span className="pill bg-indigo-50 text-indigo-700">{RATINGS[coverage.rating].label}</span>
            <span className="pill bg-slate-100 text-slate-500">{STATUSES[coverage.status]}</span>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {data?.company?.sic || ''}
            {coverage.targetPrice != null && ` · target $${Number(coverage.targetPrice).toFixed(2)}`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="btn-secondary" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <button type="button" className="btn-secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
          <div>
            <label className="label">Sector</label>
            <select className="input mt-1" value={draft.sector} onChange={(e) => setDraft({ ...draft, sector: e.target.value })}>
              {SECTORS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Rating</label>
            <select className="input mt-1" value={draft.rating} onChange={(e) => setDraft({ ...draft, rating: e.target.value })}>
              {Object.entries(RATINGS).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input mt-1" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              {Object.entries(STATUSES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Target price</label>
            <input
              className="input mt-1"
              type="number"
              step="any"
              value={draft.targetPrice}
              onChange={(e) => setDraft({ ...draft, targetPrice: e.target.value })}
            />
          </div>
          <div className="sm:col-span-4">
            <button type="button" className="btn-primary" onClick={save}>
              Save
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

export default function NameView({ coverage }) {
  const [tab, setTab] = useState('snapshot');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ cik: coverage.cik, ticker: coverage.ticker, id: coverage.id });
    fetch(`/api/name?${params}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not load this name');
        return body;
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [coverage.id, coverage.cik, coverage.ticker]);

  return (
    <div className="space-y-4">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} />
        Coverage
      </Link>

      <Header coverage={coverage} data={data} onRefresh={load} refreshing={loading} />

      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === item.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading && !data && (
        <div className="card flex items-center gap-2 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading reported financials, filings and market data…
        </div>
      )}

      {data && (
        <div>
          {tab === 'snapshot' && <Snapshot data={data} coverage={coverage} />}
          {tab === 'financials' && <Financials data={data} />}
          {tab === 'valuation' && <Valuation data={data} />}
          {tab === 'estimates' && <Estimates data={data} coverage={coverage} onChanged={load} />}
          {tab === 'catalysts' && <Catalysts coverage={coverage} />}
          {tab === 'filings' && <Filings data={data} coverage={coverage} />}
        </div>
      )}
    </div>
  );
}
