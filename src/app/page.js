import Link from 'next/link';
import { AlertTriangle, CalendarClock, CheckCircle2, FileText, Plus } from 'lucide-react';
import { listTheses, reviewQueue, calibration, redFlags, checklistProgress } from '@/lib/theses';
import { TEMPLATES } from '@/lib/checklists';
import ReviewQueue from './ReviewQueue';

export const dynamic = 'force-dynamic';

function pct(value) {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function Stat({ label, value, sub, tone = 'default' }) {
  const tones = {
    default: 'text-slate-900',
    warn: 'text-amber-600',
    danger: 'text-red-600',
  };
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tones[tone]}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function ThesisRow({ thesis }) {
  const flags = redFlags(thesis);
  const progress = checklistProgress(thesis);
  const pending = thesis.falsifiers.filter((f) => f.status === 'pending').length;
  const triggered = thesis.falsifiers.filter((f) => f.status === 'triggered').length;

  return (
    <Link
      href={`/thesis/${thesis.id}`}
      className="block border-b border-slate-100 p-4 transition-colors last:border-0 hover:bg-slate-50"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-900">{thesis.ticker}</span>
            {thesis.company && <span className="text-sm text-slate-500">{thesis.company}</span>}
            <span className="pill bg-slate-100 text-slate-600">
              {TEMPLATES[thesis.templateId]?.name || thesis.templateId}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-700">{thesis.summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {triggered > 0 && (
            <span className="pill bg-red-50 text-red-700">
              <AlertTriangle size={12} />
              {triggered} triggered
            </span>
          )}
          {flags.length > 0 && (
            <span className="pill bg-amber-50 text-amber-700">
              {flags.length} accepted {flags.length === 1 ? 'flag' : 'flags'}
            </span>
          )}
          <span className="pill bg-slate-100 text-slate-600">
            {pending} open {pending === 1 ? 'falsifier' : 'falsifiers'}
          </span>
          <span className="pill bg-slate-100 text-slate-600">
            checklist {progress.answered}/{progress.total}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function Dashboard() {
  const theses = await listTheses();
  const queue = reviewQueue(theses);
  const stats = calibration(theses);

  const open = theses.filter((t) => t.status === 'open');
  const closed = theses.filter((t) => t.status === 'closed');

  if (theses.length === 0) {
    return (
      <div className="card p-12 text-center">
        <FileText className="mx-auto h-10 w-10 text-slate-300" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">No theses yet</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          A thesis here is pre-registered: you write down what has to be true and what would prove
          you wrong, with dates, before you buy. When a date arrives the question comes back to you
          whether or not you remembered it.
        </p>
        <Link href="/thesis/new" className="btn-primary mx-auto mt-6">
          <Plus size={16} />
          Write your first thesis
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Open" value={stats.openCount} sub={`${stats.pendingFalsifiers} pending falsifiers`} />
        <Stat
          label="Due now"
          value={queue.filter((r) => r.overdue).length}
          sub="overdue reviews"
          tone={queue.some((r) => r.overdue) ? 'danger' : 'default'}
        />
        <Stat
          label="Discipline"
          value={pct(stats.disciplineRate)}
          sub="acted when a falsifier fired"
          tone={stats.disciplineRate != null && stats.disciplineRate < 0.5 ? 'warn' : 'default'}
        />
        <Stat label="Win rate" value={pct(stats.winRate)} sub={`${stats.ratedCount} priced exits`} />
        <Stat
          label="Avg return"
          value={stats.avgReturn == null ? '—' : `${(stats.avgReturn * 100).toFixed(1)}%`}
          sub="closed positions"
        />
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">Review queue</h2>
          <span className="text-sm text-slate-500">falsifiers due within 7 days</span>
        </div>
        {queue.length === 0 ? (
          <div className="card flex items-center gap-3 p-6 text-sm text-slate-600">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Nothing due. The next falsifier check is still ahead of you.
          </div>
        ) : (
          <ReviewQueue rows={queue.map(({ thesis, falsifier, dueIn, overdue }) => ({
            thesisId: thesis.id,
            ticker: thesis.ticker,
            company: thesis.company,
            summary: thesis.summary,
            falsifierId: falsifier.id,
            statement: falsifier.statement,
            dueDate: falsifier.dueDate,
            dueIn,
            overdue,
          }))} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Open positions <span className="text-sm font-normal text-slate-500">({open.length})</span>
        </h2>
        {open.length === 0 ? (
          <div className="card p-6 text-sm text-slate-600">No open theses.</div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {open.map((thesis) => (
              <ThesisRow key={thesis.id} thesis={thesis} />
            ))}
          </div>
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            Closed <span className="text-sm font-normal text-slate-500">({closed.length})</span>
          </h2>
          <div className="card divide-y divide-slate-100 opacity-80">
            {closed.map((thesis) => (
              <ThesisRow key={thesis.id} thesis={thesis} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
