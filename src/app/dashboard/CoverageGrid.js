'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Plus, Search as SearchIcon, Trash2, X } from 'lucide-react';
import { SECTORS, RATINGS, STATUSES, money, percent } from '@/lib/coverage/model';
import { addCoverageAction, removeCoverageAction } from './actions';

const RATING_CLASS = {
  buy: 'bg-emerald-50 text-emerald-700',
  hold: 'bg-slate-100 text-slate-600',
  sell: 'bg-red-50 text-red-700',
  watch: 'bg-indigo-50 text-indigo-700',
};

function Change({ value }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-slate-300">—</span>;
  const up = value >= 0;
  return (
    <span
      className={`tabular-nums ${up ? 'text-emerald-700' : 'text-red-700'}`}
      title={up ? 'up on the day' : 'down on the day'}
    >
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function AddName({ onDone }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [picked, setPicked] = useState(null);
  const [sector, setSector] = useState('Uncategorized');
  const [rating, setRating] = useState('watch');
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!query.trim() || picked) return;
    const id = setTimeout(() => {
      setSearching(true);
      fetch(`/api/companies?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => setMatches(d.companies || []))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(id);
  }, [query, picked]);

  const submit = () => {
    if (!picked) return;
    setError(null);
    startTransition(async () => {
      const result = await addCoverageAction({
        ticker: picked.ticker || picked.cik,
        cik: picked.cik,
        name: picked.name,
        sector,
        rating,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Add to coverage</h3>
        <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onDone} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      {picked ? (
        <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
          <span className="font-mono text-sm font-semibold">{picked.ticker || '—'}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{picked.name}</span>
          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setPicked(null)}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ticker or company name"
            autoFocus
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
          {matches.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {matches.map((m) => (
                <li key={`${m.cik}-${m.ticker}`}>
                  <button
                    type="button"
                    className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-slate-50"
                    onClick={() => {
                      setPicked(m);
                      setMatches([]);
                    }}
                  >
                    <span className="w-14 shrink-0 font-mono text-xs font-semibold text-indigo-700">{m.ticker || '—'}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Sector</label>
          <select className="input mt-1" value={sector} onChange={(e) => setSector(e.target.value)}>
            {SECTORS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Rating</label>
          <select className="input mt-1" value={rating} onChange={(e) => setRating(e.target.value)}>
            {Object.entries(RATINGS).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="button" className="btn-primary" disabled={!picked || pending} onClick={submit}>
        {pending ? 'Adding…' : 'Add name'}
      </button>
    </div>
  );
}

export default function CoverageGrid({ names, capabilities }) {
  const [adding, setAdding] = useState(false);
  const [quotes, setQuotes] = useState({});
  const [quotesAvailable, setQuotesAvailable] = useState(null);
  const [sectorFilter, setSectorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const router = useRouter();

  const tickers = useMemo(() => names.map((n) => n.ticker).filter(Boolean), [names]);

  useEffect(() => {
    if (!tickers.length) return;
    fetch(`/api/quotes?tickers=${encodeURIComponent(tickers.join(','))}`)
      .then((r) => r.json())
      .then((d) => {
        setQuotes(d.quotes || {});
        setQuotesAvailable(Boolean(d.available));
      })
      .catch(() => setQuotesAvailable(false));
  }, [tickers.join(',')]);

  const visible = names.filter(
    (n) =>
      (sectorFilter === 'all' || n.sector === sectorFilter) &&
      (statusFilter === 'all' || n.status === statusFilter)
  );

  const bySector = useMemo(() => {
    const groups = new Map();
    for (const name of visible) {
      if (!groups.has(name.sector)) groups.set(name.sector, []);
      groups.get(name.sector).push(name);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  const nextCatalyst = (name) => {
    const today = new Date().toISOString().slice(0, 10);
    return (name.catalysts || []).filter((c) => !c.done && c.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0] || null;
  };

  const upside = (name) => {
    const quote = quotes[name.ticker];
    if (!name.targetPrice || !quote?.price) return null;
    return (name.targetPrice - quote.price) / quote.price;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Coverage</h1>
          <p className="mt-1 text-sm text-slate-600">
            {names.length} name{names.length === 1 ? '' : 's'} across{' '}
            {new Set(names.map((n) => n.sector)).size} sector
            {new Set(names.map((n) => n.sector)).size === 1 ? '' : 's'}.
          </p>
        </div>
        {!adding && (
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            Add name
          </button>
        )}
      </div>

      {adding && <AddName onDone={() => setAdding(false)} />}

      {quotesAvailable === false && names.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>
            No quote provider configured, so price, change and upside are blank. Set{' '}
            <code className="rounded bg-amber-100 px-1">FMP_API_KEY</code> in{' '}
            <code className="rounded bg-amber-100 px-1">.env</code> — everything sourced from EDGAR
            works without it.
          </span>
        </div>
      )}

      {names.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <select className="input max-w-[14rem]" value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}>
            <option value="all">All sectors</option>
            {[...new Set(names.map((n) => n.sector))].sort().map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="input max-w-[12rem]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(STATUSES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {names.length === 0 ? (
        <div className="card p-12 text-center">
          <h2 className="text-lg font-semibold text-slate-900">No coverage yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Add the names you follow. Each one gets reported financials from EDGAR, a filing and
            catalyst feed, and a place to keep your numbers against the street&rsquo;s.
          </p>
          <button type="button" className="btn-primary mx-auto mt-5" onClick={() => setAdding(true)}>
            <Plus size={16} />
            Add your first name
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {bySector.map(([sector, rows]) => (
            <section key={sector}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {sector} <span className="font-normal text-slate-400">({rows.length})</span>
              </h2>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="px-4 py-2 font-medium">Ticker</th>
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Rating</th>
                      <th className="px-4 py-2 text-right font-medium">Price</th>
                      <th className="px-4 py-2 text-right font-medium">Chg</th>
                      <th className="px-4 py-2 text-right font-medium">Target</th>
                      <th className="px-4 py-2 text-right font-medium">Upside</th>
                      <th className="px-4 py-2 text-right font-medium">Mkt cap</th>
                      <th className="px-4 py-2 font-medium">Next catalyst</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((name) => {
                      const quote = quotes[name.ticker];
                      const up = upside(name);
                      const catalyst = nextCatalyst(name);
                      return (
                        <tr key={name.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <Link href={`/dashboard/${name.id}`} className="font-mono font-semibold text-indigo-700 hover:underline">
                              {name.ticker}
                            </Link>
                          </td>
                          <td className="max-w-[16rem] truncate px-4 py-2.5 text-slate-700">{name.name}</td>
                          <td className="px-4 py-2.5">
                            <span className={`pill ${RATING_CLASS[name.rating]}`}>{RATINGS[name.rating].label}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">
                            {quote?.price != null ? `$${quote.price.toFixed(2)}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Change value={quote?.changePercent} />
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">
                            {name.targetPrice != null ? `$${name.targetPrice.toFixed(2)}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {up == null ? (
                              <span className="text-slate-300">—</span>
                            ) : (
                              <span className={up >= 0 ? 'text-emerald-700' : 'text-red-700'}>{percent(up, { decimals: 0 })}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                            {quote?.marketCap != null ? money(quote.marketCap) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {catalyst ? (
                              <span>
                                <span className="tabular-nums text-slate-500">{catalyst.date}</span>{' '}
                                <span className="text-slate-700">{catalyst.label}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              className="text-slate-300 transition-colors hover:text-red-600"
                              title={`Remove ${name.ticker} from coverage`}
                              onClick={async () => {
                                if (!confirm(`Remove ${name.ticker} from coverage?`)) return;
                                await removeCoverageAction(name.id);
                                router.refresh();
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
