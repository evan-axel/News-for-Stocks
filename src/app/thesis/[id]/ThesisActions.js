'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clock, Plus } from 'lucide-react';
import {
  resolveFalsifierAction,
  addFalsifierAction,
  addRevisionAction,
  closeThesisAction,
} from '@/app/actions';
import { ACTION_LABELS } from '@/lib/constants';

function useAction() {
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn, onSuccess) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.ok === false) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSuccess?.();
    });
  };

  return { error, pending, run };
}

function dueLabel(dueIn) {
  if (dueIn < 0) return `${Math.abs(dueIn)}d overdue`;
  if (dueIn === 0) return 'due today';
  return `due in ${dueIn}d`;
}

export function FalsifierList({ thesisId, falsifiers }) {
  const [openId, setOpenId] = useState(null);

  return (
    <div className="card divide-y divide-slate-100">
      {falsifiers.map((falsifier) => (
        <div key={falsifier.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-900">
                <span className="text-slate-500">I am wrong if </span>
                {falsifier.statement}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">check {falsifier.dueDate}</span>
                {falsifier.status === 'pending' && (
                  <span
                    className={`pill ${
                      falsifier.dueIn < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    <Clock size={12} />
                    {dueLabel(falsifier.dueIn)}
                  </span>
                )}
                {falsifier.status === 'triggered' && (
                  <span className="pill bg-red-50 text-red-700">
                    <AlertTriangle size={12} />
                    triggered — {ACTION_LABELS[falsifier.actionTaken] || 'no action recorded'}
                  </span>
                )}
                {falsifier.status === 'survived' && (
                  <span className="pill bg-emerald-50 text-emerald-700">
                    <CheckCircle2 size={12} />
                    survived
                  </span>
                )}
              </div>
              {falsifier.resolutionNote && (
                <p className="mt-2 text-sm text-slate-600">{falsifier.resolutionNote}</p>
              )}
            </div>
            {falsifier.status === 'pending' && openId !== falsifier.id && (
              <button
                type="button"
                className="btn-secondary shrink-0"
                onClick={() => setOpenId(falsifier.id)}
              >
                Resolve
              </button>
            )}
          </div>
          {openId === falsifier.id && (
            <ResolveForm
              thesisId={thesisId}
              falsifierId={falsifier.id}
              onDone={() => setOpenId(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ResolveForm({ thesisId, falsifierId, onDone }) {
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const { error, pending, run } = useAction();

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-700">Did this happen?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatus('triggered')}
          className={`btn ${
            status === 'triggered' ? 'bg-red-600 text-white' : 'border border-slate-300 bg-white text-slate-700'
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
              : 'border border-slate-300 bg-white text-slate-700'
          }`}
        >
          No — thesis survives
        </button>
      </div>

      {status === 'triggered' && (
        <div className="mt-3">
          <label className="label">What did you actually do?</label>
          <select
            className="input mt-1"
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
          />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={!status || pending}
          onClick={() =>
            run(
              () => resolveFalsifierAction(thesisId, falsifierId, { status, note, actionTaken }),
              onDone
            )
          }
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

export function AddFalsifier({ thesisId }) {
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState('');
  const [dueDate, setDueDate] = useState('');
  const { error, pending, run } = useAction();

  if (!open) {
    return (
      <button type="button" className="btn-secondary mt-3" onClick={() => setOpen(true)}>
        <Plus size={16} />
        Add falsifier
      </button>
    );
  }

  return (
    <div className="card mt-3 p-4">
      <label className="label">New falsifier</label>
      <p className="hint">
        Added falsifiers are logged as revisions — the record shows that this one came later.
      </p>
      <input
        className="input mt-2"
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        placeholder="I am wrong if…"
      />
      <input
        className="input mt-2 max-w-[12rem]"
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={pending || !statement.trim() || !dueDate}
          onClick={() =>
            run(() => addFalsifierAction(thesisId, { statement, dueDate }), () => {
              setStatement('');
              setDueDate('');
              setOpen(false);
            })
          }
        >
          {pending ? 'Adding…' : 'Add'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function RevisionForm({ thesisId }) {
  const [note, setNote] = useState('');
  const { error, pending, run } = useAction();

  return (
    <div className="mt-4">
      <textarea
        className="input"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="New information, a changed view, something you got wrong…"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        className="btn-secondary mt-2"
        disabled={pending || !note.trim()}
        onClick={() => run(() => addRevisionAction(thesisId, note), () => setNote(''))}
      >
        {pending ? 'Saving…' : 'Append revision'}
      </button>
    </div>
  );
}

export function CloseForm({ thesisId }) {
  const [exitPrice, setExitPrice] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [reason, setReason] = useState('');
  const [lessons, setLessons] = useState('');
  const { error, pending, run } = useAction();

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Exit price</label>
          <input
            className="input mt-1"
            type="number"
            step="any"
            value={exitPrice}
            onChange={(e) => setExitPrice(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Exit date</label>
          <input
            className="input mt-1"
            type="date"
            value={exitDate}
            onChange={(e) => setExitDate(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="label">Why are you closing? *</label>
        <textarea
          className="input mt-1"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Thesis played out / a falsifier fired / I needed the capital / I changed my mind."
        />
      </div>
      <div>
        <label className="label">Lessons</label>
        <p className="hint">
          Written now, while you still remember what you thought at entry. This is the paragraph
          you will actually reread.
        </p>
        <textarea
          className="input mt-1"
          rows={3}
          value={lessons}
          onChange={(e) => setLessons(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        className="btn-danger"
        disabled={pending || !reason.trim()}
        onClick={() => run(() => closeThesisAction(thesisId, { exitPrice, exitDate, reason, lessons }))}
      >
        {pending ? 'Closing…' : 'Close position'}
      </button>
    </div>
  );
}
