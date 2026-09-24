import { loadFilings, filterFilings } from './filings';
import { loadFilingText } from './document';

/**
 * Loads the text of several of a company's filings so a question can be asked
 * across its history. Capped, because each miss is a network round trip under
 * the SEC rate limit; documents are disk-cached, so a second pass is local.
 */
export async function loadCorpus(cik, { forms = [], from = '', to = '', limit = 8 } = {}) {
  // Always load the full index here. A question scoped to a company's history
  // is usually answered by its 10-K, which falls outside the one-year `recent`
  // window; the extra cost is a couple of cached index fetches, not documents.
  const { company, filings } = await loadFilings(cik, { deep: true });
  const selected = filterFilings(filings, { forms, from, to }).slice(0, limit);

  const entries = [];
  const failures = [];

  for (const filing of selected) {
    try {
      const { text } = await loadFilingText(filing);
      if (text.trim()) entries.push({ filing, text });
    } catch (error) {
      failures.push({ accession: filing.accession, form: filing.form, reason: error.message });
    }
  }

  return { company, entries, failures, considered: selected.length };
}
