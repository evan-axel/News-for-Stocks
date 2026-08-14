/**
 * Default watch configuration.
 *
 * Grown out of the KeywordMapper in the original src/components/Search.js, then
 * reshaped around the corporate events actually being tracked.
 *
 * Two mechanisms keep this from becoming noise:
 *
 *   `matchTerm: false` — the term is a display label only, and matching runs on
 *   the synonyms. Used for concepts that are worthless as a bare phrase:
 *   "transformation" and "new era" appear in marketing copy constantly, while
 *   "multi-year transformation plan" is a real event. Alerts still read
 *   "transformation".
 *
 *   `negations` — phrases that veto the keyword even when it matched. Mostly
 *   safe-harbour boilerplate and the handful of business terms that collide with
 *   corporate-action vocabulary ("customer acquisition cost" is not an M&A deal).
 */
export interface KeywordSeed {
  term: string;
  synonyms: string[];
  negations: string[];
  /** Defaults to true. Set false when the bare term is too generic to match. */
  matchTerm?: boolean;
}

/** Safe-harbour language that appears in the footer of nearly every release. */
const COMMON_NEGATIONS = [
  'forward-looking statements',
  'no assurance can be given',
  'there can be no assurance',
];

export const DEFAULT_KEYWORDS: KeywordSeed[] = [
  /* ---------------------------------------------------------------- */
  /* Structural change                                                 */
  /* ---------------------------------------------------------------- */
  {
    term: 'transformation',
    // Bare "transformation" is in half the press releases on the wire.
    matchTerm: false,
    synonyms: [
      'transformation plan',
      'transformation program',
      'transformation initiative',
      'business transformation',
      'strategic transformation',
      'multi-year transformation',
      'transformation office',
      'transformation strategy',
      'turnaround plan',
      'operational overhaul',
    ],
    negations: COMMON_NEGATIONS,
  },
  {
    term: 'restructuring',
    synonyms: [
      'restructuring plan',
      'restructuring program',
      'operational restructuring',
      'debt restructuring',
      'recapitalization',
      'cost reduction program',
      'cost savings program',
      'reduction in force',
      'workforce reduction',
      'headcount reduction',
      'plant closure',
      'facility consolidation',
      'chapter 11',
    ],
    // A routine quarterly restructuring charge is accounting, not an event.
    negations: ['restructuring charge of', 'restructuring charges of', ...COMMON_NEGATIONS],
  },
  {
    term: 'divestiture',
    synonyms: [
      'divest',
      'divesting',
      'asset sale',
      'business sale',
      'disposition of assets',
      'carve-out',
      'sold its division',
      'sale of its subsidiary',
      'agreement to sell its',
      'exit the business',
    ],
    negations: COMMON_NEGATIONS,
  },
  {
    term: 'spin-off',
    synonyms: [
      'spinoff',
      'spin out',
      'tax-free distribution',
      'separation into two',
      'split-off',
      'standalone public company',
      'separate publicly traded',
    ],
    negations: [],
  },

  /* ---------------------------------------------------------------- */
  /* M&A                                                               */
  /* ---------------------------------------------------------------- */
  {
    term: 'acquisition',
    synonyms: [
      'definitive merger agreement',
      'agreement to acquire',
      'agreed to acquire',
      'to be acquired by',
      'was acquired by',
      'has been acquired',
      'agreed to be acquired',
      'has acquired',
      'takeover offer',
      'tender offer',
      'all-cash transaction',
      'letter of intent to acquire',
      'merger agreement with',
    ],
    negations: [
      // The single biggest false-positive family for this keyword.
      'customer acquisition',
      'user acquisition',
      'talent acquisition',
      'subscriber acquisition',
      'acquisition cost',
      'previously announced acquisition',
      'completed the acquisition',
      ...COMMON_NEGATIONS,
    ],
  },
  {
    term: 'strategic review',
    synonyms: [
      'strategic alternatives',
      'exploring options',
      'evaluating options',
      'strategic process',
      'potential sale',
      'strategic evaluation',
      'review of strategic',
      'retained a financial advisor',
      'engaged a financial advisor',
      'formal sale process',
    ],
    negations: COMMON_NEGATIONS,
  },
  {
    term: 'activist investor',
    synonyms: [
      'schedule 13d',
      'activist stake',
      'nominates directors',
      'proxy contest',
      'urges the board',
      'calls on the board',
      'beneficial ownership of',
    ],
    negations: [],
  },

  /* ---------------------------------------------------------------- */
  /* People                                                            */
  /* ---------------------------------------------------------------- */
  {
    term: 'management change',
    synonyms: [
      'leadership transition',
      'management transition',
      'leadership change',
      'executive departure',
      'senior leadership change',
      'steps down as',
      'stepping down as',
      'resigned as',
      'will retire as',
      'appointed as president',
      'named president of',
      'board refreshment',
      'resigned from the board',
      'appointed to the board',
    ],
    negations: COMMON_NEGATIONS,
  },
  {
    term: 'new ceo',
    synonyms: [
      'new chief executive',
      'appointed chief executive',
      'appointed as ceo',
      'named ceo',
      'ceo will step down',
      'ceo steps down',
      'ceo resigned',
      'ceo transition',
      'interim ceo',
      'succeed as ceo',
      'incoming ceo',
      'outgoing ceo',
    ],
    // "the CEO said" is a quote, not a change of leadership.
    negations: ['ceo said', 'ceo commented', 'ceo stated', 'ceo added', 'ceo noted'],
  },
  {
    term: 'new cfo',
    synonyms: [
      'new chief financial officer',
      'appointed chief financial officer',
      'named cfo',
      'cfo will step down',
      'cfo steps down',
      'cfo resigned',
      'cfo transition',
      'interim cfo',
      'incoming cfo',
      'outgoing cfo',
    ],
    negations: ['cfo said', 'cfo commented', 'cfo stated', 'cfo added', 'cfo noted'],
  },

  /* ---------------------------------------------------------------- */
  /* Capital structure                                                 */
  /* ---------------------------------------------------------------- */
  {
    term: 'refinancing',
    synonyms: [
      'refinance',
      'refinanced',
      'debt refinancing',
      'amended credit agreement',
      'amended and restated credit',
      'new credit facility',
      'revolving credit facility',
      'extend the maturity',
      'maturity extension',
      'repay outstanding borrowings',
      'redeem the notes',
      'senior notes offering',
      'term loan repricing',
    ],
    negations: COMMON_NEGATIONS,
  },
  {
    term: 'reverse split',
    synonyms: [
      'reverse stock split',
      'share consolidation',
      'stock consolidation',
      'regain compliance',
      'minimum bid price',
      'listing deficiency',
    ],
    negations: [],
  },
  {
    term: 'buyback',
    synonyms: [
      'share repurchase program',
      'repurchase authorization',
      'accelerated share repurchase',
      'authorized the repurchase',
    ],
    negations: [],
  },
  {
    term: 'funding',
    synonyms: [
      'private placement',
      'registered direct offering',
      'capital raise',
      'at-the-market offering',
      'convertible notes offering',
      'pipe financing',
    ],
    negations: [],
  },

  /* ---------------------------------------------------------------- */
  /* Inflection / thesis language                                      */
  /* ---------------------------------------------------------------- */
  {
    term: 'new era',
    // "a new era of..." is marketing filler; only the loaded phrasings count.
    matchTerm: false,
    synonyms: [
      'ushering in a new era',
      'beginning of a new era',
      'a new era for the company',
      'new chapter for the company',
      'transformational moment',
      'inflection point',
      'pivotal moment for',
      'fundamentally reshape',
      'reinvention of the company',
    ],
    negations: COMMON_NEGATIONS,
  },
  {
    term: 'technological shift',
    // The literal phrase almost never appears; the specific ones do.
    matchTerm: false,
    synonyms: [
      'technology transition',
      'technological shift',
      'platform shift',
      'architectural shift',
      'next-generation platform',
      'product cycle transition',
      'legacy platform sunset',
      'end of life for',
      'migrate customers to',
      'technology roadmap',
    ],
    negations: COMMON_NEGATIONS,
  },

  /* ---------------------------------------------------------------- */
  /* Trading signals                                                   */
  /* ---------------------------------------------------------------- */
  {
    term: 'going concern',
    synonyms: [
      'substantial doubt',
      'ability to continue as a going concern',
      'material weakness',
      'covenant breach',
      'default under the credit agreement',
    ],
    negations: [],
  },
  {
    term: 'guidance raise',
    synonyms: [
      'raises full-year guidance',
      'raising guidance',
      'increases outlook',
      'above the high end',
      'upwardly revised',
      'beat and raise',
    ],
    negations: [],
  },
  {
    term: 'guidance cut',
    synonyms: [
      'lowers guidance',
      'reduces full-year',
      'cuts outlook',
      'withdraws guidance',
      'below the low end',
      'suspends guidance',
    ],
    negations: [],
  },
  {
    term: 'insider buying',
    synonyms: [
      'form 4',
      'open market purchase',
      'purchased shares of common stock',
      'increased his stake',
      'increased her stake',
    ],
    negations: [],
  },
];

/* -------------------------------------------------------------------------- */
/* Default company filters                                                     */
/* -------------------------------------------------------------------------- */

export interface FilterSeed {
  kind: 'sector' | 'industry' | 'market_cap' | 'exchange' | 'country' | 'ticker';
  value?: string;
  minValue?: number;
  maxValue?: number;
  mode: 'include' | 'exclude';
  /** Why this default exists, for the seed log and the dashboard. */
  note: string;
}

/**
 * Shipped defaults: $50M–$20B market cap, every industry except banks and
 * biotech.
 *
 * Excludes are matched as case-insensitive substrings against the provider's
 * industry string, so "bank" catches "Banks—Regional" and "Banks—Diversified",
 * and "biotech" catches "Biotechnology". Excluding at the *industry* level
 * rather than the sector level deliberately keeps medtech, devices, and
 * healthcare services in scope — only drug developers are dropped.
 */
export const DEFAULT_FILTERS: FilterSeed[] = [
  {
    kind: 'market_cap',
    minValue: 50_000_000,
    maxValue: 20_000_000_000,
    mode: 'include',
    note: '$50M to $20B — big enough to be real, small enough to move',
  },
  { kind: 'industry', value: 'bank', mode: 'exclude', note: 'skip banks' },
  { kind: 'industry', value: 'biotech', mode: 'exclude', note: 'skip biotech' },
];
