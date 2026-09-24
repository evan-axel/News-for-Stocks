/**
 * Passage retrieval over filing text.
 *
 * Lexical (BM25) rather than embeddings, for three reasons: filings questions
 * are overwhelmingly phrased in the filing's own vocabulary ("goodwill
 * impairment", "Item 5.02", "covenant"), exact tokens like section numbers and
 * years matter and embeddings blur them, and it keeps the app to one API key.
 */

const STOPWORDS = new Set(
  ('a an the and or but if of to in on at by for with from as is are was were be been being ' +
    'this that these those it its we our us they their there here has have had do does did ' +
    'will would shall should may might can could not no nor so than then such other any each ' +
    'which who whom what when where how all some more most much many very')
    .split(' ')
);

export function tokenize(text) {
  const tokens = [];
  const pattern = /[a-z0-9][a-z0-9.\-']*/g;
  let match;
  while ((match = pattern.exec(String(text).toLowerCase())) !== null) {
    const token = match[0].replace(/[.\-']+$/, '');
    if (!token || token.length > 40) continue;
    if (STOPWORDS.has(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

/**
 * Splits text into overlapping passages on paragraph boundaries, keeping each
 * passage's offset into the source so a citation can be mapped back to the
 * exact span in the document pane.
 *
 * Every passage is a literal slice of the source — the function tracks ranges
 * and never rebuilds text by joining pieces. That is what makes
 * `source.slice(chunk.start, chunk.end) === chunk.text` hold, which is the
 * invariant citation highlighting rests on.
 */
export function chunkText(text, { target = 1600, overlap = 200 } = {}) {
  const source = String(text || '');
  if (!source.trim()) return [];

  // Paragraph ranges as [start, end) into the source.
  const paragraphs = [];
  const splitter = /\n{2,}/g;
  let cursor = 0;
  let match;
  while ((match = splitter.exec(source)) !== null) {
    if (match.index > cursor) paragraphs.push([cursor, match.index]);
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) paragraphs.push([cursor, source.length]);

  const chunks = [];

  const push = (from, to) => {
    let start = from;
    let end = to;
    while (start < end && /\s/.test(source[start])) start++;
    while (end > start && /\s/.test(source[end - 1])) end--;
    if (end > start) {
      chunks.push({ index: chunks.length, start, end, text: source.slice(start, end) });
    }
  };

  let rangeStart = null;
  let rangeEnd = null;

  for (const [paraStart, paraEnd] of paragraphs) {
    if (!source.slice(paraStart, paraEnd).trim()) continue;

    // A single oversized paragraph (usually a long table) is hard-split.
    if (paraEnd - paraStart > target * 2) {
      if (rangeStart !== null) push(rangeStart, rangeEnd);
      rangeStart = null;
      rangeEnd = null;
      for (let offset = paraStart; offset < paraEnd; offset += target) {
        push(offset, Math.min(offset + target, paraEnd));
      }
      continue;
    }

    if (rangeStart === null) {
      rangeStart = paraStart;
      rangeEnd = paraEnd;
      continue;
    }

    if (rangeEnd - rangeStart + (paraEnd - paraStart) > target) {
      push(rangeStart, rangeEnd);
      // Step back into the passage just emitted so a boundary cannot cut an
      // answer in half. Still a plain range, so offsets stay true.
      rangeStart = Math.max(rangeStart, rangeEnd - overlap);
      rangeEnd = paraEnd;
    } else {
      rangeEnd = paraEnd;
    }
  }

  if (rangeStart !== null) push(rangeStart, rangeEnd);

  return chunks;
}

/**
 * Filing vocabulary is not the vocabulary people ask questions in. A reader
 * types "CFO"; the document says "Chief Financial Officer". Lexical retrieval
 * scores those as unrelated, so the query is expanded before scoring.
 *
 * This is the same insight as the scanner's keyword map, applied where it pays
 * off: at query time, where a wrong expansion costs a little precision instead
 * of silently dropping a document from the corpus.
 */
export const QUERY_SYNONYMS = {
  cfo: ['chief financial officer', 'finance chief'],
  ceo: ['chief executive officer'],
  coo: ['chief operating officer'],
  cto: ['chief technology officer'],
  chairman: ['chair', 'board chair'],
  resigned: ['resignation', 'departure', 'stepped down', 'terminated', 'separation'],
  fired: ['terminated', 'dismissed', 'removed'],
  hired: ['appointed', 'elected', 'named'],
  buyback: ['repurchase', 'repurchases', 'treasury stock'],
  dividend: ['distribution', 'payout'],
  debt: ['indebtedness', 'borrowings', 'notes payable', 'credit facility', 'term loan'],
  loan: ['credit facility', 'term loan', 'revolver', 'borrowings'],
  covenant: ['covenants', 'compliance', 'leverage ratio'],
  dilution: ['issuance', 'offering', 'warrants', 'convertible', 'at-the-market'],
  impairment: ['write-down', 'writedown', 'goodwill impairment', 'charge'],
  layoffs: ['reduction in force', 'restructuring', 'severance', 'workforce reduction'],
  lawsuit: ['litigation', 'legal proceedings', 'complaint', 'claim'],
  guidance: ['outlook', 'forecast', 'expectations'],
  merger: ['acquisition', 'business combination', 'combination'],
  acquisition: ['merger', 'business combination', 'purchase'],
  spinoff: ['spin-off', 'separation', 'distribution'],
  bankruptcy: ['chapter 11', 'reorganization', 'receivership'],
  'going concern': ['substantial doubt'],
  auditor: ['independent registered public accounting firm', 'certifying accountant'],
  restatement: ['non-reliance', 'restate', 'restated'],
  insider: ['related party', 'affiliate'],
  activist: ['schedule 13d', '13d', 'beneficial ownership'],
  revenue: ['net sales', 'net revenue', 'total revenue'],
  profit: ['net income', 'earnings'],
  loss: ['net loss', 'operating loss'],
  margin: ['gross margin', 'gross profit'],
  cash: ['cash and cash equivalents', 'liquidity'],
  risk: ['risk factors'],
  customer: ['concentration', 'significant customer'],
  delisting: ['listing standards', 'listing rule', 'minimum bid price'],
};

export function expandQuery(query) {
  const raw = String(query || '').toLowerCase();
  const tokens = tokenize(raw);
  const extra = [];

  for (const [key, expansions] of Object.entries(QUERY_SYNONYMS)) {
    const hit = key.includes(' ') ? raw.includes(key) : tokens.includes(key);
    if (hit) extra.push(...expansions);
  }

  return extra.length ? `${query} ${extra.join(' ')}` : String(query || '');
}

/** BM25 over a fixed passage set. */
export function buildIndex(documents) {
  const postings = new Map();
  const lengths = [];
  let totalLength = 0;

  documents.forEach((doc, i) => {
    const tokens = tokenize(doc.text);
    lengths[i] = tokens.length;
    totalLength += tokens.length;

    const counts = new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);

    for (const [token, count] of counts) {
      if (!postings.has(token)) postings.set(token, []);
      postings.get(token).push([i, count]);
    }
  });

  return {
    documents,
    postings,
    lengths,
    avgLength: documents.length ? totalLength / documents.length : 0,
  };
}

export function search(index, query, limit = 8, { expand = true } = {}) {
  const { documents, postings, lengths, avgLength } = index;
  if (!documents.length) return [];

  const k1 = 1.5;
  const b = 0.75;
  const N = documents.length;
  const scores = new Map();

  const queryTokens = [...new Set(tokenize(expand ? expandQuery(query) : query))];

  for (const token of queryTokens) {
    const posting = postings.get(token);
    if (!posting) continue;

    const idf = Math.log(1 + (N - posting.length + 0.5) / (posting.length + 0.5));

    for (const [docIndex, frequency] of posting) {
      const norm = 1 - b + (b * lengths[docIndex]) / (avgLength || 1);
      const tf = (frequency * (k1 + 1)) / (frequency + k1 * norm);
      scores.set(docIndex, (scores.get(docIndex) || 0) + idf * tf);
    }
  }

  return [...scores.entries()]
    .sort((a, b2) => b2[1] - a[1])
    .slice(0, limit)
    .map(([docIndex, score]) => ({ ...documents[docIndex], score }));
}
