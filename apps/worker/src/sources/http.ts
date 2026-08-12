import { logger } from '../logger.js';

export interface FetchOptions {
  /** Sent verbatim. SEC in particular rejects generic agents. */
  userAgent?: string;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Conditional-GET validators from the previous fetch of this URL. */
  etag?: string | null;
  lastModified?: string | null;
}

export interface FetchResult {
  status: number;
  /** Empty when the server answered 304. */
  body: string;
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
}

const DEFAULT_UA = 'News-for-Stocks/0.1 (+https://github.com/evan-axel/News-for-Stocks)';

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET a URL as text with bounded retries and conditional-GET support.
 *
 * Retries only on transient conditions (network error, 429, 5xx). A 403/404 is
 * treated as terminal — retrying a policy denial or a dead feed just wastes the
 * scan window and, for SEC, risks a longer block.
 */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const {
    userAgent = DEFAULT_UA,
    timeoutMs = 20_000,
    retries = 2,
    headers = {},
    etag = null,
    lastModified = null,
  } = opts;

  const requestHeaders: Record<string, string> = {
    'user-agent': userAgent,
    accept: 'application/atom+xml, application/rss+xml, application/xml, application/json, text/xml, text/html;q=0.8, */*;q=0.5',
    'accept-encoding': 'gzip, deflate',
    ...headers,
  };
  if (etag) requestHeaders['if-none-match'] = etag;
  if (lastModified) requestHeaders['if-modified-since'] = lastModified;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(2 ** attempt * 500, 8_000));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: requestHeaders, signal: controller.signal, redirect: 'follow' });

      if (res.status === 304) {
        return { status: 304, body: '', etag, lastModified, notModified: true };
      }
      if (!res.ok) {
        if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
          lastError = new Error(`HTTP ${res.status} ${res.statusText}`);
          continue;
        }
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }

      return {
        status: res.status,
        body: await res.text(),
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        notModified: false,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isAbort = lastError.name === 'AbortError';
      const terminal = /HTTP (4\d\d)/.test(lastError.message) && !/HTTP (408|429)/.test(lastError.message);
      if (terminal || attempt === retries) {
        throw isAbort ? new Error(`timeout after ${timeoutMs}ms for ${url}`) : lastError;
      }
      logger.debug({ url, attempt, err: lastError.message }, 'fetch retry');
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error(`fetch failed for ${url}`);
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchText(url, {
    ...opts,
    headers: { accept: 'application/json', ...(opts.headers ?? {}) },
  });
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new Error(`invalid JSON from ${url}: ${res.body.slice(0, 200)}`);
  }
}
