import { readAll, transact, newId } from './store';
import { TEMPLATES, allItemsFor, redFlags, checklistProgress } from './checklists';
import { FALSIFIER_STATUS, ACTION_LABELS } from './constants';

export { FALSIFIER_STATUS, ACTION_LABELS };

/** Local calendar date as YYYY-MM-DD. Comparable lexicographically. */
export function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function daysBetween(fromISODate, toISODate) {
  const a = Date.parse(`${fromISODate}T00:00:00Z`);
  const b = Date.parse(`${toISODate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

function normaliseFalsifier(input) {
  return {
    id: newId('fal'),
    statement: String(input.statement || '').trim(),
    dueDate: String(input.dueDate || '').trim(),
    status: FALSIFIER_STATUS.PENDING,
    resolvedAt: null,
    resolutionNote: '',
    actionTaken: null,
  };
}

/**
 * Creates and immediately pre-registers a thesis. `preRegistration.snapshot` is
 * a frozen copy of the reasoning at entry; later edits append revisions and
 * never touch it. That asymmetry is the feature — a journal you can quietly
 * rewrite tells you nothing about your own judgement later.
 */
export function createThesis(input) {
  const templateId = TEMPLATES[input.templateId] ? input.templateId : 'quality';
  const now = new Date().toISOString();

  const whatHasToBeTrue = (input.whatHasToBeTrue || [])
    .map((s) => String(s).trim())
    .filter(Boolean);

  const falsifiers = (input.falsifiers || [])
    .filter((f) => String(f.statement || '').trim() && String(f.dueDate || '').trim())
    .map(normaliseFalsifier);

  if (falsifiers.length < 2) {
    throw new Error('At least two falsifiers with due dates are required before a thesis can be pre-registered.');
  }
  if (!String(input.ticker || '').trim()) {
    throw new Error('Ticker is required.');
  }
  if (!String(input.summary || '').trim()) {
    throw new Error('A one-line thesis summary is required.');
  }
  if (!String(input.preMortem || '').trim()) {
    throw new Error('The pre-mortem is required — write why this lost money before you own it.');
  }

  const checklist = {};
  for (const item of allItemsFor(templateId)) {
    const raw = input.checklist?.[item.id] || {};
    const answer = ['yes', 'no', 'na'].includes(raw.answer) ? raw.answer : null;
    checklist[item.id] = { answer, note: String(raw.note || '').trim() };
  }

  const thesis = {
    id: newId('th'),
    ticker: String(input.ticker).trim().toUpperCase(),
    company: String(input.company || '').trim(),
    templateId,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    position: {
      entryPrice: numOrNull(input.entryPrice),
      sizePct: numOrNull(input.sizePct),
      entryDate: String(input.entryDate || today()),
    },
    summary: String(input.summary).trim(),
    variantPerception: String(input.variantPerception || '').trim(),
    whatHasToBeTrue,
    preMortem: String(input.preMortem).trim(),
    valuation: {
      method: String(input.valuationMethod || '').trim(),
      estimate: numOrNull(input.valuationEstimate),
    },
    checklist,
    falsifiers,
    revisions: [],
    outcome: null,
  };

  thesis.preRegistration = {
    at: now,
    snapshot: {
      summary: thesis.summary,
      variantPerception: thesis.variantPerception,
      whatHasToBeTrue: [...thesis.whatHasToBeTrue],
      preMortem: thesis.preMortem,
      valuation: { ...thesis.valuation },
      position: { ...thesis.position },
      falsifiers: thesis.falsifiers.map((f) => ({ statement: f.statement, dueDate: f.dueDate })),
      checklist: JSON.parse(JSON.stringify(thesis.checklist)),
      redFlags: redFlags(thesis).map((f) => ({ id: f.id, text: f.text, note: f.note })),
    },
  };

  return transact(async (rows) => {
    rows.push(thesis);
    return { rows, result: thesis };
  });
}

function numOrNull(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function listTheses() {
  const rows = await readAll();
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getThesis(id) {
  const rows = await readAll();
  return rows.find((t) => t.id === id) || null;
}

function mutate(id, fn) {
  return transact(async (rows) => {
    const index = rows.findIndex((t) => t.id === id);
    if (index === -1) throw new Error('Thesis not found.');
    const next = fn({ ...rows[index] });
    next.updatedAt = new Date().toISOString();
    rows[index] = next;
    return { rows, result: next };
  });
}

/** Resolves a pre-registered falsifier. Triggered ones demand a stated action. */
export function resolveFalsifier(thesisId, falsifierId, { status, note, actionTaken }) {
  if (![FALSIFIER_STATUS.TRIGGERED, FALSIFIER_STATUS.SURVIVED].includes(status)) {
    throw new Error('A falsifier resolves to either triggered or survived.');
  }
  if (status === FALSIFIER_STATUS.TRIGGERED && !ACTION_LABELS[actionTaken]) {
    throw new Error('When a falsifier triggers you must record what you actually did about it.');
  }

  return mutate(thesisId, (thesis) => {
    const falsifiers = thesis.falsifiers.map((f) =>
      f.id === falsifierId
        ? {
            ...f,
            status,
            resolvedAt: new Date().toISOString(),
            resolutionNote: String(note || '').trim(),
            actionTaken: status === FALSIFIER_STATUS.TRIGGERED ? actionTaken : null,
          }
        : f
    );
    if (!falsifiers.some((f) => f.id === falsifierId)) throw new Error('Falsifier not found.');
    return { ...thesis, falsifiers };
  });
}

/** Reopens a falsifier — recorded as a revision so it stays visible. */
export function addFalsifier(thesisId, { statement, dueDate }) {
  if (!String(statement || '').trim() || !String(dueDate || '').trim()) {
    throw new Error('A falsifier needs both a statement and a due date.');
  }
  return mutate(thesisId, (thesis) => ({
    ...thesis,
    falsifiers: [...thesis.falsifiers, normaliseFalsifier({ statement, dueDate })],
    revisions: [
      ...thesis.revisions,
      {
        id: newId('rev'),
        at: new Date().toISOString(),
        kind: 'falsifier-added',
        note: `Added falsifier: "${String(statement).trim()}" (due ${dueDate})`,
      },
    ],
  }));
}

/** Append-only. Nothing in the original pre-registration is ever overwritten. */
export function addRevision(thesisId, note) {
  const text = String(note || '').trim();
  if (!text) throw new Error('A revision needs a note.');
  return mutate(thesisId, (thesis) => ({
    ...thesis,
    revisions: [
      ...thesis.revisions,
      { id: newId('rev'), at: new Date().toISOString(), kind: 'note', note: text },
    ],
  }));
}

export function closeThesis(thesisId, { exitPrice, exitDate, reason, lessons }) {
  if (!String(reason || '').trim()) throw new Error('Record why you closed the position.');
  return mutate(thesisId, (thesis) => ({
    ...thesis,
    status: 'closed',
    outcome: {
      closedAt: new Date().toISOString(),
      exitDate: String(exitDate || today()),
      exitPrice: numOrNull(exitPrice),
      reason: String(reason).trim(),
      lessons: String(lessons || '').trim(),
    },
  }));
}

// ---------------------------------------------------------------- review queue

/**
 * Pending falsifiers on open theses, overdue first. This is what the journal
 * exists to produce: the date arrives and the question comes back to you
 * whether or not you remembered it.
 */
export function reviewQueue(theses, horizonDays = 7) {
  const now = today();
  const rows = [];

  for (const thesis of theses) {
    if (thesis.status !== 'open') continue;
    for (const falsifier of thesis.falsifiers) {
      if (falsifier.status !== FALSIFIER_STATUS.PENDING) continue;
      const dueIn = daysBetween(now, falsifier.dueDate);
      if (dueIn <= horizonDays) {
        rows.push({ thesis, falsifier, dueIn, overdue: dueIn < 0 });
      }
    }
  }

  return rows.sort((a, b) => a.dueIn - b.dueIn);
}

export function calibration(theses) {
  const open = theses.filter((t) => t.status === 'open');
  const closed = theses.filter((t) => t.status === 'closed');

  const resolved = theses.flatMap((t) =>
    t.falsifiers.filter((f) => f.status !== FALSIFIER_STATUS.PENDING)
  );
  const triggered = resolved.filter((f) => f.status === FALSIFIER_STATUS.TRIGGERED);
  const actedOn = triggered.filter((f) => f.actionTaken && f.actionTaken !== 'held');

  const withPrices = closed.filter(
    (t) => t.outcome?.exitPrice != null && t.position?.entryPrice
  );
  const winners = withPrices.filter((t) => t.outcome.exitPrice > t.position.entryPrice);

  const returns = withPrices.map(
    (t) => (t.outcome.exitPrice - t.position.entryPrice) / t.position.entryPrice
  );
  const avgReturn = returns.length
    ? returns.reduce((sum, r) => sum + r, 0) / returns.length
    : null;

  return {
    openCount: open.length,
    closedCount: closed.length,
    pendingFalsifiers: open.flatMap((t) =>
      t.falsifiers.filter((f) => f.status === FALSIFIER_STATUS.PENDING)
    ).length,
    resolvedCount: resolved.length,
    triggeredCount: triggered.length,
    // Of the falsifiers that fired, how often did you actually do something?
    disciplineRate: triggered.length ? actedOn.length / triggered.length : null,
    winRate: withPrices.length ? winners.length / withPrices.length : null,
    avgReturn,
    ratedCount: withPrices.length,
  };
}

export { redFlags, checklistProgress };
