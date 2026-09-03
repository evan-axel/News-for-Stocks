# Thesis Journal

A pre-registered investment journal. You write down what has to be true and what
would prove you wrong — with dates — *before* you buy. When a date arrives, the
question comes back to you whether or not you remembered it.

The premise is that a journal you can quietly edit tells you nothing about your
own judgement later. So the reasoning you enter at the start is frozen, and
everything you think afterwards is appended beside it.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

No API key is needed for the journal. `.env` is only used by the `/scanner`
page (see below).

Your journal lives in `data/theses.json`, which is gitignored — theses,
positions and post-mortems stay on your machine. Back it up like any other
private file.

## How it works

**Pre-registration.** Creating a thesis captures a frozen snapshot: the
one-line thesis, the variant perception, the load-bearing assumptions, the
valuation, the pre-mortem, and the checklist as answered at entry. Nothing
overwrites it. Later thinking becomes an append-only revision log underneath.

**Falsifiers.** At least two are required, each a statement plus a date. They
are written to be checkable by a stranger — "gross margin is below 34% for two
consecutive quarters", not "the story deteriorates". Pending falsifiers within
seven days of their date appear in the dashboard review queue, overdue first.

**Resolving a falsifier** asks two questions: did it happen, and — if it did —
*what did you actually do about it?* The second one is the point. The dashboard
tracks your discipline rate: of the falsifiers that fired, how often you acted
rather than held. Writing a falsifier is easy; honouring one is the whole
exercise.

**Checklists.** Four templates, assembled from published frameworks:

| Template | Sections |
| --- | --- |
| Quality / Compounder | Pre-mortem, Business Quality & Moat, Expectations, Sizing |
| Deep Value / Graham | Pre-mortem, Statistical Cheapness & Balance Sheet, Expectations, Sizing |
| Special Situation / Catalyst | Pre-mortem, Special Situation & Catalyst, Expectations, Sizing |
| Full Work-Up | All six sections |

Sources, per section:

- **Pre-Mortem & Risk** — Pabrai and Spier's post-mortem-derived checklists,
  Munger's inversion. Runs on every idea regardless of style.
- **Business Quality & Moat** — Buffett on owner earnings, Fisher's 15 Points,
  Greenwald's franchise analysis.
- **Statistical Cheapness & Balance Sheet** — Graham's defensive criteria and
  net-net arithmetic.
- **Special Situation & Catalyst** — Greenblatt on spin-offs and
  recapitalisations, merger-arb and activist practice.
- **Expectations & Variant Perception** — Mauboussin's *Expectations
  Investing*, Marks on second-level thinking.
- **Sizing & Portfolio Fit** — Kelly-informed sizing and correlation
  discipline.

Items are phrased so "yes" is the reassuring answer. Items marked **critical**
demand a written justification when answered "no" — the checklist never blocks
you, it just makes you say out loud what you are being paid to accept. Those
accepted risks surface as a banner on the thesis for as long as you hold it.

Edit `src/lib/checklists.js` to add your own items; the forms and detail views
are generated from it.

## Layout

```
src/lib/store.js        atomic JSON persistence, serialized writes
src/lib/checklists.js   the checklist library (edit this)
src/lib/theses.js       domain logic, review queue, calibration stats
src/app/actions.js      server actions
src/app/page.js         dashboard: stats, review queue, positions
src/app/thesis/new/     four-step pre-registration form
src/app/thesis/[id]/    thesis detail, falsifier resolution, close-out
src/app/scanner/        the pre-existing news scanner
```

## The scanner

`/scanner` is the earlier Alpha Vantage news search, kept working and moved off
the home page. It still has known limits: the symbol is hardcoded to `IBM` and
the search query is accepted but not yet applied as a filter
(`src/app/api/search/route.js`). It needs `ALPHA_VANTAGE_API_KEY` in `.env` —
see `.env.example`.
