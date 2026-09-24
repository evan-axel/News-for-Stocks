import { secFetchJson, TTL, secWww, secData } from './client';
import { padCik, shortCik } from './companies';
import { ITEM_LABELS } from './forms';

export { FORM_GROUPS, ALL_FORMS, ITEM_LABELS } from './forms';

function submissionsUrl(cik) {
  return `${secData()}/submissions/CIK${padCik(cik)}.json`;
}

/** The submissions feed is columnar: parallel arrays keyed by field name. */
function columnsToRows(block, company) {
  if (!block || !Array.isArray(block.accessionNumber)) return [];

  const count = block.accessionNumber.length;
  const col = (name) => (Array.isArray(block[name]) ? block[name] : []);

  const rows = [];
  for (let i = 0; i < count; i++) {
    const accession = block.accessionNumber[i];
    if (!accession) continue;

    const items = String(col('items')[i] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    rows.push({
      accession,
      accessionPlain: accession.replace(/-/g, ''),
      cik: company.cik,
      ticker: company.ticker,
      companyName: company.name,
      form: String(col('form')[i] || ''),
      filingDate: String(col('filingDate')[i] || ''),
      reportDate: String(col('reportDate')[i] || ''),
      primaryDocument: String(col('primaryDocument')[i] || ''),
      description: String(col('primaryDocDescription')[i] || ''),
      size: Number(col('size')[i]) || 0,
      items,
      itemLabels: items.map((code) => ITEM_LABELS[code]).filter(Boolean),
    });
  }
  return rows;
}

export function documentUrl(filing) {
  if (!filing.primaryDocument) {
    return `${secWww()}/Archives/edgar/data/${shortCik(filing.cik)}/${filing.accessionPlain}/${filing.accession}.txt`;
  }
  return `${secWww()}/Archives/edgar/data/${shortCik(filing.cik)}/${filing.accessionPlain}/${filing.primaryDocument}`;
}

export function filingIndexUrl(filing) {
  return `${secWww()}/Archives/edgar/data/${shortCik(filing.cik)}/${filing.accessionPlain}/${filing.accession}-index.htm`;
}

/**
 * Loads a company's filing history. `recent` covers roughly the last year or
 * 1,000 filings; anything older lives in the paginated files the feed points
 * at, which are only fetched when `deep` is set.
 */
export async function loadFilings(cikOrCompany, { deep = false } = {}) {
  const cik = typeof cikOrCompany === 'string' ? cikOrCompany : cikOrCompany.cik;
  const data = await secFetchJson(submissionsUrl(cik), { maxAgeMs: TTL.HOUR });

  const company = {
    cik: padCik(data.cik || cik),
    name: String(data.name || ''),
    ticker: Array.isArray(data.tickers) && data.tickers[0] ? String(data.tickers[0]) : '',
    sic: String(data.sicDescription || ''),
    exchange: Array.isArray(data.exchanges) && data.exchanges[0] ? String(data.exchanges[0]) : '',
  };

  let filings = columnsToRows(data.filings?.recent, company);

  if (deep && Array.isArray(data.filings?.files)) {
    for (const file of data.filings.files) {
      if (!file?.name) continue;
      try {
        const older = await secFetchJson(`${secData()}/submissions/${file.name}`, {
          maxAgeMs: TTL.WEEK,
        });
        filings = filings.concat(columnsToRows(older, company));
      } catch {
        // An unavailable archive page should not lose the filings we do have.
      }
    }
  }

  filings.sort((a, b) => (a.filingDate < b.filingDate ? 1 : -1));
  return { company, filings };
}

export function filterFilings(filings, { forms = [], from = '', to = '', items = [], q = '' } = {}) {
  const formSet = new Set(forms.filter(Boolean));
  const itemSet = new Set(items.filter(Boolean));
  const needle = String(q || '').trim().toLowerCase();

  return filings.filter((filing) => {
    // "10-K" should also match "10-K/A"; an exact pick of "10-K/A" should not
    // pull in the original.
    if (formSet.size) {
      const matched = [...formSet].some(
        (form) => filing.form === form || filing.form.startsWith(`${form}/`)
      );
      if (!matched) return false;
    }
    if (from && filing.filingDate < from) return false;
    if (to && filing.filingDate > to) return false;
    if (itemSet.size && !filing.items.some((code) => itemSet.has(code))) return false;
    if (needle) {
      const hay = `${filing.form} ${filing.description} ${filing.itemLabels.join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export async function getFiling(cik, accession) {
  const { company, filings } = await loadFilings(cik, { deep: true });
  const normalized = String(accession).replace(/-/g, '');
  const filing = filings.find((f) => f.accessionPlain === normalized);
  return filing ? { company, filing } : { company, filing: null };
}
