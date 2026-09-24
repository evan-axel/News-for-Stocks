'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Building2, FileText, Loader2, Search as SearchIcon, X } from 'lucide-react';
import { FORM_GROUPS } from '@/lib/sec/forms';

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function CompanyPicker({ company, onPick }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounced = useDebounced(query, 250);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!debounced.trim()) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/companies?q=${encodeURIComponent(debounced)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Company lookup failed');
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setMatches(data.companies || []);
        setOpen(true);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (company) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
        <Building2 className="h-5 w-5 shrink-0 text-indigo-600" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {company.ticker && (
              <span className="font-mono text-sm font-semibold text-slate-900">{company.ticker}</span>
            )}
            <span className="truncate text-sm text-slate-700">{company.name}</span>
          </div>
          <div className="text-xs text-slate-500">CIK {company.cik}</div>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 px-2 py-1"
          onClick={() => {
            onPick(null);
            setQuery('');
            setMatches([]);
          }}
          aria-label="Clear company"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => matches.length && setOpen(true)}
          placeholder="Ticker, company name, or CIK — e.g. AAPL, Silica, 320193"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        )}
      </div>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}

      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {matches.map((match) => (
            <li key={`${match.cik}-${match.ticker}`}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => {
                  onPick(match);
                  setOpen(false);
                }}
              >
                <span className="w-16 shrink-0 font-mono text-xs font-semibold text-indigo-700">
                  {match.ticker || '—'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{match.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{match.cik}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function bytes(n) {
  if (!n) return '';
  if (n > 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(n / 1000)} KB`;
}

export default function SearchPanel() {
  const [company, setCompany] = useState(null);
  const [forms, setForms] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [deep, setDeep] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toggleForm = (form) =>
    setForms((prev) => (prev.includes(form) ? prev.filter((f) => f !== form) : [...prev, form]));

  const run = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ cik: company.cik });
    forms.forEach((form) => params.append('form', form));
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (deep || from) params.set('deep', '1');

    try {
      const res = await fetch(`/api/filings?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Filing lookup failed');
      setResults(data);
    } catch (err) {
      setError(err.message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [company, forms, from, to, deep]);

  // Re-run automatically once a company is chosen and whenever filters change.
  useEffect(() => {
    if (company) run();
  }, [company, forms, from, to, deep, run]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">SEC filings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Search a company&rsquo;s filings, read the text with an analyst summary beside it, and ask
          questions answered from the filings themselves.
        </p>
      </div>

      <div className="card space-y-4 p-6">
        <div>
          <label className="label">Company</label>
          <div className="mt-1">
            <CompanyPicker company={company} onPick={setCompany} />
          </div>
        </div>

        <div>
          <label className="label">Filing type</label>
          <div className="mt-2 space-y-2">
            {FORM_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                <span className="w-40 shrink-0 text-xs text-slate-500">{group.label}</span>
                {group.forms.map((form) => (
                  <button
                    key={form}
                    type="button"
                    onClick={() => toggleForm(form)}
                    className={`pill border transition-colors ${
                      forms.includes(form)
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {form}
                  </button>
                ))}
              </div>
            ))}
          </div>
          {forms.length > 0 && (
            <button
              type="button"
              className="mt-2 text-xs text-slate-500 underline hover:text-slate-800"
              onClick={() => setForms([])}
            >
              Clear filing types
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">From</label>
            <input className="input mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input className="input mt-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={deep}
                onChange={(e) => setDeep(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Full history
            </label>
          </div>
        </div>
        <p className="hint">
          Without &ldquo;full history&rdquo; the search covers roughly the last year. Setting a
          &ldquo;from&rdquo; date turns it on automatically.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading && (
        <div className="card flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching filings from EDGAR…
        </div>
      )}

      {results && !loading && (
        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {results.company.name || company?.name}
              {results.company.sic && (
                <span className="ml-2 text-sm font-normal text-slate-500">{results.company.sic}</span>
              )}
            </h2>
            <span className="text-sm text-slate-500">
              {results.total} filing{results.total === 1 ? '' : 's'}
              {results.truncated && ` (showing ${results.filings.length})`}
            </span>
          </div>

          {results.filings.length === 0 ? (
            <div className="card p-6 text-sm text-slate-600">
              No filings matched. Try clearing the filing-type filters or enabling full history.
            </div>
          ) : (
            <div className="card divide-y divide-slate-100">
              {results.filings.map((filing) => (
                <Link
                  key={filing.accession}
                  href={`/research/${filing.cik}/${filing.accessionPlain}`}
                  className="block p-4 transition-colors hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="pill bg-indigo-50 font-mono text-indigo-700">{filing.form}</span>
                        <span className="text-sm text-slate-500">{filing.filingDate}</span>
                        {filing.reportDate && filing.reportDate !== filing.filingDate && (
                          <span className="text-xs text-slate-400">period {filing.reportDate}</span>
                        )}
                      </div>
                      {filing.description && (
                        <p className="mt-1 text-sm text-slate-700">{filing.description}</p>
                      )}
                      {filing.itemLabels.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {filing.itemLabels.map((item) => (
                            <li key={item} className="pill bg-amber-50 text-amber-800">
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                      <FileText size={14} />
                      {bytes(filing.size)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
