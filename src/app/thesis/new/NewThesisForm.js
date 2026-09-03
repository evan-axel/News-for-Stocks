'use client';

import { useMemo, useState, useTransition } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { TEMPLATES, templateSections } from '@/lib/checklists';
import { createThesisAction } from '@/app/actions';

const STEPS = ['Position', 'Thesis', 'Falsifiers', 'Checklist'];

function todayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function plusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function NewThesisForm() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    ticker: '',
    company: '',
    templateId: 'quality',
    entryPrice: '',
    sizePct: '',
    entryDate: todayISO(),
    summary: '',
    variantPerception: '',
    whatHasToBeTrue: ['', '', ''],
    valuationMethod: '',
    valuationEstimate: '',
    preMortem: '',
    falsifiers: [
      { statement: '', dueDate: plusDays(90) },
      { statement: '', dueDate: plusDays(180) },
    ],
    checklist: {},
  });

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const sections = useMemo(() => templateSections(form.templateId), [form.templateId]);

  const setChecklist = (itemId, patch) =>
    setForm((prev) => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [itemId]: { answer: null, note: '', ...prev.checklist[itemId], ...patch },
      },
    }));

  const validFalsifiers = form.falsifiers.filter(
    (f) => f.statement.trim() && f.dueDate.trim()
  );

  const stepValid = [
    form.ticker.trim().length > 0,
    form.summary.trim().length > 0 && form.preMortem.trim().length > 0,
    validFalsifiers.length >= 2,
    true,
  ];

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createThesisAction({
        ...form,
        whatHasToBeTrue: form.whatHasToBeTrue.filter((s) => s.trim()),
        falsifiers: validFalsifiers,
      });
      // A successful create redirects, so anything returned here is a failure.
      if (result?.ok === false) setError(result.error);
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Pre-register a thesis</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Everything you write here is frozen on submit. Later thinking is appended as revisions
          alongside the original, never over it — so that months from now you can see what you
          actually believed, not what you would prefer to have believed.
        </p>
      </div>

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((name, index) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => setStep(index)}
              className={`pill ${
                index === step
                  ? 'bg-indigo-600 text-white'
                  : index < step
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {index + 1}. {name}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="card space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Ticker *</label>
              <input
                className="input mt-1 font-mono uppercase"
                value={form.ticker}
                onChange={(e) => set({ ticker: e.target.value })}
                placeholder="ABCD"
              />
            </div>
            <div>
              <label className="label">Company</label>
              <input
                className="input mt-1"
                value={form.company}
                onChange={(e) => set({ company: e.target.value })}
                placeholder="Example Industries Inc."
              />
            </div>
          </div>

          <div>
            <label className="label">Thesis type</label>
            <p className="hint">Determines which checklist sections you work through.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {Object.values(TEMPLATES).map((template) => (
                <button
                  type="button"
                  key={template.id}
                  onClick={() => set({ templateId: template.id })}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    form.templateId === template.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm font-medium text-slate-900">{template.name}</div>
                  <div className="mt-0.5 text-xs text-slate-600">{template.blurb}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Entry price</label>
              <input
                className="input mt-1"
                type="number"
                step="any"
                value={form.entryPrice}
                onChange={(e) => set({ entryPrice: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Size (% of portfolio)</label>
              <input
                className="input mt-1"
                type="number"
                step="any"
                value={form.sizePct}
                onChange={(e) => set({ sizePct: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Entry date</label>
              <input
                className="input mt-1"
                type="date"
                value={form.entryDate}
                onChange={(e) => set({ entryDate: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card space-y-5 p-6">
          <div>
            <label className="label">Thesis in one sentence *</label>
            <p className="hint">If it needs two sentences you do not have it yet.</p>
            <input
              className="input mt-1"
              value={form.summary}
              onChange={(e) => set({ summary: e.target.value })}
              placeholder="Market prices this as a declining distributor; it is a licensing business with two years of contracted revenue."
            />
          </div>

          <div>
            <label className="label">Variant perception</label>
            <p className="hint">
              Consensus expects X, I think Y, because Z. Not &ldquo;good company at a fair
              price&rdquo; — what do you believe that the price does not?
            </p>
            <textarea
              className="input mt-1"
              rows={3}
              value={form.variantPerception}
              onChange={(e) => set({ variantPerception: e.target.value })}
            />
          </div>

          <div>
            <label className="label">What has to be true</label>
            <p className="hint">
              The load-bearing assumptions. Each one is a place the thesis can break.
            </p>
            <div className="mt-2 space-y-2">
              {form.whatHasToBeTrue.map((value, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    className="input"
                    value={value}
                    onChange={(e) => {
                      const next = [...form.whatHasToBeTrue];
                      next[index] = e.target.value;
                      set({ whatHasToBeTrue: next });
                    }}
                    placeholder={`Assumption ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="btn-secondary shrink-0 px-3"
                    onClick={() =>
                      set({ whatHasToBeTrue: form.whatHasToBeTrue.filter((_, i) => i !== index) })
                    }
                    aria-label="Remove assumption"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-secondary mt-2"
              onClick={() => set({ whatHasToBeTrue: [...form.whatHasToBeTrue, ''] })}
            >
              <Plus size={16} />
              Add assumption
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Valuation method</label>
              <input
                className="input mt-1"
                value={form.valuationMethod}
                onChange={(e) => set({ valuationMethod: e.target.value })}
                placeholder="Reverse DCF / NCAV / SOTP / EPV"
              />
            </div>
            <div>
              <label className="label">Value estimate (per share)</label>
              <input
                className="input mt-1"
                type="number"
                step="any"
                value={form.valuationEstimate}
                onChange={(e) => set({ valuationEstimate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Pre-mortem *</label>
            <p className="hint">
              It is two years from now and this position lost half its value. Write the story of how
              that happened. Do it now, while you can still change your mind cheaply.
            </p>
            <textarea
              className="input mt-1"
              rows={4}
              value={form.preMortem}
              onChange={(e) => set({ preMortem: e.target.value })}
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              What would prove you wrong, and by when?
            </h2>
            <p className="hint">
              Each falsifier is a dated question that will be put back to you on its due date. Write
              them so that a stranger could check the answer without asking your opinion. At least
              two are required.
            </p>
          </div>

          <div className="space-y-3">
            {form.falsifiers.map((falsifier, index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 shrink-0 text-sm text-slate-500">I am wrong if</span>
                  <input
                    className="input"
                    value={falsifier.statement}
                    onChange={(e) => {
                      const next = [...form.falsifiers];
                      next[index] = { ...next[index], statement: e.target.value };
                      set({ falsifiers: next });
                    }}
                    placeholder="gross margin is below 34% for two consecutive quarters"
                  />
                  <button
                    type="button"
                    className="btn-secondary mt-0 shrink-0 px-3"
                    onClick={() => set({ falsifiers: form.falsifiers.filter((_, i) => i !== index) })}
                    aria-label="Remove falsifier"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-slate-500">Check on</span>
                  <input
                    className="input max-w-[12rem]"
                    type="date"
                    value={falsifier.dueDate}
                    onChange={(e) => {
                      const next = [...form.falsifiers];
                      next[index] = { ...next[index], dueDate: e.target.value };
                      set({ falsifiers: next });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              set({ falsifiers: [...form.falsifiers, { statement: '', dueDate: plusDays(90) }] })
            }
          >
            <Plus size={16} />
            Add falsifier
          </button>

          {validFalsifiers.length < 2 && (
            <p className="text-sm text-amber-700">
              Two complete falsifiers are needed before this thesis can be pre-registered.
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.id} className="card p-6">
              <h2 className="text-base font-semibold text-slate-900">{section.name}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{section.source}</p>
              <p className="mt-2 text-sm text-slate-600">{section.blurb}</p>

              <div className="mt-4 space-y-4">
                {section.items.map((item) => {
                  const state = form.checklist[item.id] || {};
                  return (
                    <div key={item.id} className="border-t border-slate-100 pt-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            {item.text}
                            {item.critical && (
                              <span className="ml-2 pill bg-red-50 text-red-700">critical</span>
                            )}
                          </p>
                          <p className="hint">{item.hint}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {[
                            ['yes', 'Yes', 'bg-emerald-600'],
                            ['no', 'No', 'bg-red-600'],
                            ['na', 'N/A', 'bg-slate-500'],
                          ].map(([value, label, active]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setChecklist(item.id, { answer: value })}
                              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                state.answer === value
                                  ? `${active} text-white`
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {state.answer === 'no' && item.critical && (
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3">
                          <label className="label text-red-900">
                            Why are you accepting this risk?
                          </label>
                          <textarea
                            className="input mt-1"
                            rows={2}
                            value={state.note || ''}
                            onChange={(e) => setChecklist(item.id, { note: e.target.value })}
                            placeholder="A critical item you answered no to. State the compensation you are getting for it."
                          />
                        </div>
                      )}
                      {state.answer && !(state.answer === 'no' && item.critical) && (
                        <input
                          className="input mt-2"
                          value={state.note || ''}
                          onChange={(e) => setChecklist(item.id, { note: e.target.value })}
                          placeholder="Evidence / note (optional)"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || pending}
        >
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setStep((s) => s + 1)}
            disabled={!stepValid[step]}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={submit}
            disabled={pending || !stepValid[0] || !stepValid[1] || !stepValid[2]}
          >
            <Lock size={16} />
            {pending ? 'Pre-registering…' : 'Pre-register thesis'}
          </button>
        )}
      </div>
    </div>
  );
}
