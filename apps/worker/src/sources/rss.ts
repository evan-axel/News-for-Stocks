import { XMLParser } from 'fast-xml-parser';
import type { RawItem, SourceKind } from '../types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  // Feeds are wildly inconsistent about whether a field is a string or an
  // object with @_href / #text, so we normalize downstream rather than here.
  parseTagValue: false,
});

/** Coerce the many shapes a feed field can take into a plain string. */
function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('#text' in obj) return text(obj['#text']);
    if ('@_href' in obj) return text(obj['@_href']);
  }
  return '';
}

/** Atom <link> is often an array of rel-typed objects; prefer rel="alternate". */
function linkOf(entry: Record<string, unknown>): string {
  const raw = entry['link'];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    const alt = raw.find(
      (l) => typeof l === 'object' && l !== null && (l as Record<string, unknown>)['@_rel'] === 'alternate',
    );
    return text(alt ?? raw[0]);
  }
  if (raw && typeof raw === 'object') return text(raw);
  return text(entry['guid']) || text(entry['id']);
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(value: string): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Google News wraps every link in a news.google.com redirect and suffixes the
 * title with " - Publisher". Unwrap both so dedupe and display behave.
 */
function cleanGoogleNews(item: { title: string; url: string }): { title: string; url: string } {
  let { title, url } = item;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('news.google.com')) {
      const target = parsed.searchParams.get('url');
      if (target) url = target;
    }
  } catch {
    /* leave url as-is */
  }
  return { title, url };
}

export interface ParseFeedArgs {
  xml: string;
  sourceId: string;
  sourceName: string;
  sourceKind: SourceKind;
}

/** Parse an RSS 2.0 or Atom document into RawItems. Unknown shapes yield []. */
export function parseFeed({ xml, sourceId, sourceName, sourceKind }: ParseFeedArgs): RawItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  const rss = doc['rss'] as Record<string, unknown> | undefined;
  const rdf = doc['rdf:RDF'] as Record<string, unknown> | undefined;
  const feed = doc['feed'] as Record<string, unknown> | undefined;

  let entries: Record<string, unknown>[] = [];
  if (rss) {
    const channel = rss['channel'] as Record<string, unknown> | undefined;
    entries = asArray(channel?.['item'] as Record<string, unknown>[] | undefined);
  } else if (rdf) {
    entries = asArray(rdf['item'] as Record<string, unknown>[] | undefined);
  } else if (feed) {
    entries = asArray(feed['entry'] as Record<string, unknown>[] | undefined);
  }

  const items: RawItem[] = [];
  for (const entry of entries) {
    const rawTitle = stripHtml(text(entry['title']));
    const rawUrl = linkOf(entry);
    if (!rawTitle && !rawUrl) continue;

    const { title, url } = cleanGoogleNews({ title: rawTitle, url: rawUrl });

    const body = stripHtml(
      text(entry['content:encoded']) ||
        text(entry['content']) ||
        text(entry['description']) ||
        text(entry['summary']),
    );

    const published = parseDate(
      text(entry['pubDate']) ||
        text(entry['published']) ||
        text(entry['updated']) ||
        text(entry['dc:date']),
    );

    // Prefer the URL as identity; fall back to guid for feeds with unstable links.
    const externalId = url || `${sourceId}:${text(entry['guid']) || text(entry['id']) || title}`;

    items.push({
      externalId: canonicalizeUrl(externalId),
      sourceId,
      sourceName,
      sourceKind,
      title,
      url: url || externalId,
      body,
      publishedAt: published,
    });
  }

  return items;
}

/** Drop tracking params and trailing slashes so the same story dedupes cleanly. */
export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const strip = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'oc',
    ];
    for (const p of strip) u.searchParams.delete(p);
    u.hash = '';
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return raw.trim();
  }
}
