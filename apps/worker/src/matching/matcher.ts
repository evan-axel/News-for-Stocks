import type { Keyword, Match, RawItem } from '../types.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a matcher for one phrase.
 *
 * Internal whitespace matches any run of whitespace (feeds contain newlines and
 * non-breaking spaces mid-phrase). Boundaries are asserted only where the phrase
 * actually starts/ends with a word character, so "spin-off" and "$ACME" match.
 */
export function phraseRegex(phrase: string): RegExp {
  const trimmed = phrase.trim();
  const body = escapeRegex(trimmed).replace(/\\?\s+/g, '\\s+');
  const left = /^\w/.test(trimmed) ? '\\b' : '';
  const right = /\w$/.test(trimmed) ? '\\b' : '';
  return new RegExp(`${left}${body}${right}`, 'i');
}

const regexCache = new Map<string, RegExp>();
function cachedRegex(phrase: string): RegExp {
  let re = regexCache.get(phrase);
  if (!re) {
    re = phraseRegex(phrase);
    regexCache.set(phrase, re);
  }
  return re;
}

/** Pull ~`radius` chars around a match, snapped outward to word boundaries. */
export function extractSnippet(text: string, index: number, length: number, radius = 110): string {
  const rawStart = Math.max(0, index - radius);
  const rawEnd = Math.min(text.length, index + length + radius);

  let start = rawStart;
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space !== -1 && space < index) start = space + 1;
  }
  let end = rawEnd;
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > index + length) end = space;
  }

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

/**
 * Test every enabled keyword against an item.
 *
 * The title is weighted by being searched first — a phrase in the headline is
 * the story, the same phrase in paragraph nine usually is not. At most one match
 * is returned per keyword so a release repeating "strategic alternatives" six
 * times still produces one alert.
 */
export function findMatches(item: RawItem, keywords: Keyword[]): Match[] {
  const haystacks = [item.title, item.body].filter(Boolean);
  const combined = haystacks.join('\n\n');
  const matches: Match[] = [];

  for (const keyword of keywords) {
    if (!keyword.enabled) continue;

    // A negation anywhere in the document vetoes the keyword entirely.
    const vetoed = keyword.negations.some((n) => n && cachedRegex(n).test(combined));
    if (vetoed) continue;

    const phrases = [keyword.term, ...keyword.synonyms].filter(Boolean);
    let found: { phrase: string; snippet: string } | null = null;

    for (const haystack of haystacks) {
      for (const phrase of phrases) {
        const m = cachedRegex(phrase).exec(haystack);
        if (m && m.index !== undefined) {
          found = {
            phrase: m[0],
            snippet: extractSnippet(haystack, m.index, m[0].length),
          };
          break;
        }
      }
      if (found) break;
    }

    if (found) {
      matches.push({ keyword, matchedPhrase: found.phrase, snippet: found.snippet });
    }
  }

  return matches;
}
