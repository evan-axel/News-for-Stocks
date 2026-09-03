import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Lock } from 'lucide-react';
import { getThesis, redFlags, checklistProgress, daysBetween, today } from '@/lib/theses';
import { TEMPLATES, templateSections } from '@/lib/checklists';
import { ACTION_LABELS } from '@/lib/constants';
import { FalsifierList, AddFalsifier, RevisionForm, CloseForm } from './ThesisActions';

export const dynamic = 'force-dynamic';

function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Field({ label, children }) {
  if (!children) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{children}</div>
    </div>
  );
}

export default async function ThesisPage({ params }) {
  const thesis = await getThesis(params.id);
  if (!thesis) notFound();

  const flags = redFlags(thesis);
  const progress = checklistProgress(thesis);
  const sections = templateSections(thesis.templateId);
  const pre = thesis.preRegistration?.snapshot || {};

  const answerStyles = {
    yes: 'bg-emerald-50 text-emerald-700',
    no: 'bg-red-50 text-red-700',
    na: 'bg-slate-100 text-slate-500',
  };

  const gainPct =
    thesis.outcome?.exitPrice != null && thesis.position?.entryPrice
      ? ((thesis.outcome.exitPrice - thesis.position.entryPrice) / thesis.position.entryPrice) * 100
      : null;

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} />
        Back to journal
      </Link>

      <header className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold text-slate-900">{thesis.ticker}</h1>
              {thesis.company && <span className="text-slate-500">{thesis.company}</span>}
              <span className="pill bg-slate-100 text-slate-600">
                {TEMPLATES[thesis.templateId]?.name || thesis.templateId}
              </span>
              <span
                className={`pill ${
                  thesis.status === 'open'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {thesis.status}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-800">{thesis.summary}</p>
          </div>
          <div className="text-right text-sm text-slate-600">
            {thesis.position?.entryPrice != null && (
              <div>
                Entry <span className="font-mono">{thesis.position.entryPrice}</span>
              </div>
            )}
            {thesis.position?.sizePct != null && <div>Size {thesis.position.sizePct}%</div>}
            <div className="text-xs text-slate-400">{thesis.position?.entryDate}</div>
          </div>
        </div>
      </header>

      {flags.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-900">
              Critical items you consciously accepted ({flags.length})
            </h2>
          </div>
          <ul className="mt-3 space-y-2">
            {flags.map((flag) => (
              <li key={flag.id} className="text-sm">
                <span className="text-amber-900">{flag.text}</span>
                {flag.note && <p className="mt-0.5 text-amber-800/80">{flag.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-6">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Pre-registration</h2>
          <span className="text-xs text-slate-500">
            frozen {formatDateTime(thesis.preRegistration?.at)}
          </span>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Variant perception">{pre.variantPerception}</Field>
          {pre.whatHasToBeTrue?.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                What has to be true
              </div>
              <ul className="mt-1 list-inside list-decimal space-y-1 text-sm text-slate-800">
                {pre.whatHasToBeTrue.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <Field label="Pre-mortem">{pre.preMortem}</Field>
          {pre.valuation?.method && (
            <Field label="Valuation">
              {pre.valuation.method}
              {pre.valuation.estimate != null ? ` — ${pre.valuation.estimate} per share` : ''}
            </Field>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Falsifiers</h2>
        <FalsifierList
          thesisId={thesis.id}
          falsifiers={thesis.falsifiers.map((f) => ({
            ...f,
            dueIn: daysBetween(today(), f.dueDate),
          }))}
        />
        {thesis.status === 'open' && <AddFalsifier thesisId={thesis.id} />}
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Checklist</h2>
          <span className="text-sm text-slate-500">
            {progress.answered} of {progress.total} answered
          </span>
        </div>
        <div className="mt-4 space-y-5">
          {sections.map((section) => (
            <details key={section.id} className="group">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-800 hover:text-indigo-700">
                <span className="mr-2 text-slate-400 group-open:hidden">▸</span>
                <span className="mr-2 hidden text-slate-400 group-open:inline">▾</span>
                {section.name}
                <span className="ml-2 text-xs font-normal text-slate-500">{section.source}</span>
              </summary>
              <ul className="mt-3 space-y-2 pl-5">
                {section.items.map((item) => {
                  const state = thesis.checklist?.[item.id] || {};
                  return (
                    <li key={item.id} className="flex items-start gap-3">
                      <span
                        className={`pill mt-0.5 shrink-0 ${
                          answerStyles[state.answer] || 'bg-slate-50 text-slate-400'
                        }`}
                      >
                        {state.answer ? state.answer.toUpperCase() : '—'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800">{item.text}</p>
                        {state.note && <p className="mt-0.5 text-xs text-slate-500">{state.note}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-base font-semibold text-slate-900">Revisions</h2>
        <p className="mt-1 text-sm text-slate-600">
          Appended, never overwritten. New information goes here so the original reasoning above
          stays honest.
        </p>
        {thesis.revisions.length > 0 && (
          <ol className="mt-4 space-y-3 border-l border-slate-200 pl-4">
            {thesis.revisions.map((revision) => (
              <li key={revision.id}>
                <div className="text-xs text-slate-500">{formatDateTime(revision.at)}</div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{revision.note}</p>
              </li>
            ))}
          </ol>
        )}
        <RevisionForm thesisId={thesis.id} />
      </section>

      {thesis.status === 'open' ? (
        <section className="card p-6">
          <h2 className="text-base font-semibold text-slate-900">Close position</h2>
          <CloseForm thesisId={thesis.id} />
        </section>
      ) : (
        <section className="card p-6">
          <h2 className="text-base font-semibold text-slate-900">Outcome</h2>
          <div className="mt-3 space-y-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-slate-500">Exit</span>{' '}
                <span className="font-mono">{thesis.outcome?.exitPrice ?? '—'}</span>
              </div>
              <div>
                <span className="text-slate-500">Date</span> {thesis.outcome?.exitDate}
              </div>
              {gainPct != null && (
                <div className={gainPct >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                  {gainPct >= 0 ? '+' : ''}
                  {gainPct.toFixed(1)}%
                </div>
              )}
            </div>
            <Field label="Why closed">{thesis.outcome?.reason}</Field>
            <Field label="Lessons">{thesis.outcome?.lessons}</Field>
            {thesis.falsifiers.some((f) => f.status === 'triggered') && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                Falsifiers that fired:{' '}
                {thesis.falsifiers
                  .filter((f) => f.status === 'triggered')
                  .map((f) => ACTION_LABELS[f.actionTaken] || 'no action recorded')
                  .join(', ')}
                .
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
