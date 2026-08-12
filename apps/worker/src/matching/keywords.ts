/**
 * Default keyword pack.
 *
 * Grown out of the KeywordMapper in the original src/components/Search.js, with
 * negations added — the expansion sets alone fire constantly on boilerplate
 * ("forward-looking statements", "the Company may explore..."), and a keyword
 * that cries wolf gets muted, which defeats the point.
 */
export interface KeywordSeed {
  term: string;
  synonyms: string[];
  negations: string[];
}

/** Boilerplate that appears in the safe-harbour section of nearly every release. */
const COMMON_NEGATIONS = [
  'forward-looking statements',
  'no assurance can be given',
  'there can be no assurance',
];

export const DEFAULT_KEYWORDS: KeywordSeed[] = [
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
    term: 'divestiture',
    synonyms: [
      'asset sale',
      'business sale',
      'divest',
      'divesting',
      'disposition of assets',
      'carve-out',
      'sold its division',
      'sale of its subsidiary',
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
  {
    term: 'ceo change',
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
    ],
    negations: ['ceo said', 'ceo commented', 'ceo stated', 'ceo of the company said'],
  },
  {
    term: 'cfo change',
    synonyms: [
      'new chief financial officer',
      'appointed chief financial officer',
      'named cfo',
      'cfo will step down',
      'cfo steps down',
      'cfo resigned',
      'cfo transition',
      'interim cfo',
    ],
    negations: ['cfo said', 'cfo commented', 'cfo stated'],
  },
  {
    term: 'acquisition',
    synonyms: [
      'definitive merger agreement',
      'agreement to acquire',
      'to be acquired by',
      'takeover offer',
      'tender offer',
      'all-cash transaction',
      'letter of intent to acquire',
    ],
    // "completed the acquisition" is old news by the time it is announced.
    negations: ['completed the acquisition', 'previously announced acquisition', ...COMMON_NEGATIONS],
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
    term: 'partnership',
    synonyms: [
      'strategic partnership',
      'joint venture',
      'strategic alliance',
      'definitive collaboration agreement',
      'exclusive distribution agreement',
    ],
    negations: COMMON_NEGATIONS,
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
