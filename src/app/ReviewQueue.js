'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Clock } from 'lucide-react';
import { resolveFalsifierAction } from './actions';
import { ACTION_LABELS } from '@/lib/constants';

function dueLabel(dueIn) {
  if (dueIn < 0) return `${Math.abs(dueIn)}d overdue`;
  if (dueIn === 0) return 'due today';
  return `due in ${dueIn}d`;
}

function ResolveForm({ row, onDone }) {
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await resolveFalsifierAction(row.thesisId, row.falsifierId, {
        status,
        note,
        actionTaken,
      });
      if (result?.ok === false) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-700">Did this happen?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatus('triggered')}
          className={`btn ${
            status === 'triggered'
              ? 'bg-red-600 text-white'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-white'
          }`}
        >
          Yes — I was wrong
        </button>
        <button
          type="button"
          onClick={() => {
            setStatus('survived');
            setActionTaken('');
          }}
          className={`btn ${
            status === 'survived'
              ? 'bg-emerald-600 text-white'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-white'
          }`}
        >
          No — thesis survives
        </button>
      </div>

      {status === 'triggered' && (
        <div className="mt-3">
          <label className="label">What did you actually do?</label>
          <p className="hint">
            This is the number that matters. Writing a falsifier is easy; honouring one is the
            entire discipline.
          </p>
          <select
            className="input mt-2"
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
          >
            <option value="">Select…</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {status && (
        <div className="mt-3">
          <label className="label">Note</label>
          <textarea
            className="input mt-1"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What you found, and what it changes."
          />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={!status || pending}
          onClick={submit}
        >
          {pending ? 'Saving…' : 'Record'}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ReviewQueue({ rows }) {
  const [openId, setOpenId] = useState(null);

  return (
    <div className="card divide-y divide-slate-100">
      {rows.map((row) => (
        <div key={row.falsifierId} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href={`/thesis/${row.thesisId}`}
                  className="font-mono text-sm font-semibold text-indigo-700 hover:underline"
                >
                  {row.ticker}
                </Link>
                {row.company && <span className="text-sm text-slate-500">{row.company}</span>}
                <span
                  className={`pill ${
                    row.overdue ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {row.overdue ? <AlertTriangle size={12} /> : <Clock size={12} />}
                  {dueLabel(row.dueIn)}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-900">
                <span className="text-slate-500">I am wrong if </span>
                {row.statement}
              </p>
              <p className="mt-1 text-xs text-slate-500">Pre-registered check date: {row.dueDate}</p>
            </div>
            {openId !== row.falsifierId && (
              <button
                type="button"
                className="btn-secondary shrink-0"
                onClick={() => setOpenId(row.falsifierId)}
              >
                Resolve
              </button>
            )}
          </div>
          {openId === row.falsifierId && (
            <ResolveForm row={row} onDone={() => setOpenId(null)} />
          )}
        </div>
      ))}
    </div>
  );
}
