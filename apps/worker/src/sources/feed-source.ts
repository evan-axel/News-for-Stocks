import { config } from '../config.js';
import type { Repo } from '../db/repo.js';
import { fetchText } from './http.js';
import { parseFeed } from './rss.js';
import type { Source } from './types.js';
import type { RawItem, SourceKind } from '../types.js';

export interface FeedDefinition {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  /** SEC needs its own contact-bearing agent; everything else uses the default. */
  userAgent?: string;
}

/**
 * Wraps an RSS/Atom URL as a Source, with conditional GET so we re-download a
 * feed only when it actually changed. Validators live in the kv table, which
 * means politeness survives restarts.
 */
export function createFeedSource(def: FeedDefinition, repo: Repo): Source {
  return {
    id: def.id,
    name: def.name,
    kind: def.kind,
    async fetch(): Promise<RawItem[]> {
      const etagKey = `etag:${def.id}`;
      const lmKey = `lastmod:${def.id}`;

      const res = await fetchText(def.url, {
        userAgent: def.userAgent,
        etag: repo.kvGet(etagKey),
        lastModified: repo.kvGet(lmKey),
      });

      if (res.notModified) return [];

      if (res.etag) repo.kvSet(etagKey, res.etag);
      if (res.lastModified) repo.kvSet(lmKey, res.lastModified);

      return parseFeed({
        xml: res.body,
        sourceId: def.id,
        sourceName: def.name,
        sourceKind: def.kind,
      });
    },
  };
}

/**
 * Newswire and news feeds.
 *
 * NOTE: publisher feed URLs drift. None of these were reachable from the build
 * environment (egress policy blocked them), so treat this list as a starting
 * point: run `npm run scan:once` after deploying and check the source-health
 * table — any feed reporting an error or zero items over several runs needs its
 * URL refreshed. A dead feed never breaks the scan, it just stops contributing.
 */
export const FEED_CATALOG: FeedDefinition[] = [
  // --- primary press-release wires (highest signal for corporate actions) ---
  {
    id: 'globenewswire',
    name: 'GlobeNewswire',
    kind: 'newswire',
    url: 'https://www.globenewswire.com/RssFeed/orgclass/1/feedTitle/GlobeNewswire%20-%20News%20about%20Public%20Companies',
  },
  {
    id: 'businesswire',
    name: 'Business Wire',
    kind: 'newswire',
    url: 'https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeEFpRVw==',
  },
  {
    id: 'prnewswire',
    name: 'PR Newswire',
    kind: 'newswire',
    url: 'https://www.prnewswire.com/rss/news-releases-list.rss',
  },
  {
    id: 'prnewswire-financial',
    name: 'PR Newswire Financial',
    kind: 'newswire',
    url: 'https://www.prnewswire.com/rss/financial-services-latest-news/financial-services-latest-news-list.rss',
  },
  {
    id: 'accesswire',
    name: 'ACCESSWIRE',
    kind: 'newswire',
    url: 'https://www.accesswire.com/rss/latest',
  },
  {
    id: 'newsfile',
    name: 'Newsfile',
    kind: 'newswire',
    url: 'https://www.newsfilecorp.com/rss',
  },

  // --- general financial news ---
  {
    id: 'yahoo-finance',
    name: 'Yahoo Finance',
    kind: 'news',
    url: 'https://finance.yahoo.com/news/rssindex',
  },
  {
    id: 'cnbc-markets',
    name: 'CNBC Markets',
    kind: 'news',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
  },
  {
    id: 'marketwatch-realtime',
    name: 'MarketWatch',
    kind: 'news',
    url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines',
  },
  {
    id: 'seekingalpha-market',
    name: 'Seeking Alpha Market News',
    kind: 'news',
    url: 'https://seekingalpha.com/market_currents.xml',
  },
];

/**
 * Google News search RSS, one feed per watched keyword. This is what gives
 * broad coverage of ordinary news sites without paying for a news API.
 */
export function googleNewsFeedFor(term: string): FeedDefinition {
  const query = encodeURIComponent(`"${term}"`);
  return {
    id: `gnews:${term.replace(/\s+/g, '-')}`,
    name: `Google News: ${term}`,
    kind: 'news',
    url: `https://news.google.com/rss/search?q=${query}+when:1d&hl=en-US&gl=US&ceid=US:en`,
  };
}

export function secUserAgent(): string {
  return config.SEC_USER_AGENT;
}
