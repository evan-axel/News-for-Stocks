import { secFetch } from './client';
import { documentUrl } from './filings';

const NAMED_ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  bull: '•',
  reg: '®',
  copy: '©',
  trade: '™',
  sect: '§',
  para: '¶',
  deg: '°',
  middot: '·',
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

/**
 * Turns a filing document into readable plain text.
 *
 * Filings are HTML built almost entirely out of nested layout tables, usually
 * with inline XBRL tags wrapped around every number. Full DOM parsing buys
 * little here because there is no semantic structure to recover — what matters
 * is keeping cell and row boundaries visible so figures stay attached to their
 * labels, and dropping everything else.
 */
export function htmlToText(html) {
  let text = String(html || '');

  text = text.replace(/<\?xml[\s\S]*?\?>/gi, '');
  text = text.replace(/<!DOCTYPE[^>]*>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<head\b[\s\S]*?<\/head>/gi, '');
  text = text.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style\b[\s\S]*?<\/style>/gi, '');

  // Cell boundaries become a visible separator; row and block boundaries
  // become newlines. Done before the generic tag strip so the structure
  // survives it.
  text = text.replace(/<\/(td|th)\s*>/gi, '\t');
  text = text.replace(/<\/(tr|table)\s*>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|li|h[1-6]|section|article|blockquote)\s*>/gi, '\n');
  text = text.replace(/<(hr)\s*\/?>/gi, '\n');

  text = text.replace(/<[^>]+>/g, '');
  text = decodeEntities(text);

  // Non-breaking and zero-width characters are everywhere in filings.
  text = text.replace(/[   ]/g, ' ');
  text = text.replace(/[​-‍﻿]/g, '');
  text = text.replace(/\r\n?/g, '\n');

  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n');

  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * A `.txt` accession is the full submission: several documents concatenated
 * inside <DOCUMENT> wrappers. The first non-exhibit one is the filing itself.
 */
function extractPrimaryFromSubmission(raw) {
  const docs = [...raw.matchAll(/<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi)].map((m) => m[1]);
  if (!docs.length) return raw;

  const preferred = docs.find((doc) => {
    const type = doc.match(/<TYPE>([^\n<]+)/i)?.[1]?.trim() || '';
    return type && !/^(EX-|GRAPHIC|EXCEL|XML|JSON|ZIP)/i.test(type);
  });

  const chosen = preferred || docs[0];
  const inner = chosen.match(/<TEXT>([\s\S]*?)(?:<\/TEXT>|$)/i)?.[1];
  return inner || chosen;
}

export async function loadFilingText(filing) {
  const url = documentUrl(filing);
  const raw = await secFetch(url, { maxAgeMs: null });

  const looksLikeSubmission = /<SEC-DOCUMENT>|<DOCUMENT>\s*<TYPE>/i.test(raw.slice(0, 4000));
  const body = looksLikeSubmission ? extractPrimaryFromSubmission(raw) : raw;

  const isMarkup = /<\/?[a-z][\s\S]*>/i.test(body.slice(0, 4000));
  const text = isMarkup ? htmlToText(body) : body.replace(/\r\n?/g, '\n').trim();

  return { url, text, bytes: raw.length };
}

/**
 * Locates the standard Item headings so the viewer can offer a jump list.
 * Matches "Item 1A. Risk Factors" and "ITEM 5.02" alike.
 */
export function findSections(text) {
  const sections = [];
  const pattern = /^\s*item\s+(\d{1,2}(?:\.\d{2})?[A-Z]?)\s*[.:—-]?\s*(.{0,90})$/gim;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const title = match[2].replace(/\s+/g, ' ').trim();
    // Cross-references ("see Item 8") sit mid-sentence and are not headings.
    if (title.length > 80) continue;
    sections.push({
      id: `item-${match[1].toLowerCase()}-${match.index}`,
      number: match[1],
      title,
      offset: match.index,
    });
  }

  // The table of contents repeats every heading; keep the later occurrence,
  // which is the section itself rather than its contents entry.
  const byNumber = new Map();
  for (const section of sections) byNumber.set(section.number, section);
  return [...byNumber.values()].sort((a, b) => a.offset - b.offset);
}
