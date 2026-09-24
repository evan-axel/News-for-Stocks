import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = path.join(process.cwd(), 'data', 'sec-cache');

/**
 * Runtime configuration is read with bracket access, deliberately.
 *
 * Next's build inlines `process.env.FOO` written as a property access and then
 * constant-folds it away, which freezes whatever was set at build time into the
 * bundle — so editing .env afterwards would silently do nothing. Bracket access
 * is not rewritten, so these stay real lookups at request time.
 */
function env(name) {
  return process.env[name];
}

/**
 * SEC host names, overridable so the app can be pointed at a caching proxy or
 * a local fixture server. Defaults are the real thing.
 */
export function secWww() {
  return (env('SEC_WWW_BASE') || 'https://www.sec.gov').replace(/\/+$/, '');
}

export function secData() {
  return (env('SEC_DATA_BASE') || 'https://data.sec.gov').replace(/\/+$/, '');
}

/**
 * SEC asks every automated client to declare itself with a contact address and
 * to stay under 10 requests/second. Both are conditions of access, not
 * suggestions — they block user agents that ignore them.
 * https://www.sec.gov/os/webmaster-faq#developers
 */
export function userAgent() {
  const ua = env('SEC_USER_AGENT');
  if (!ua || !ua.trim()) {
    throw new Error(
      'SEC_USER_AGENT is not set. SEC requires a declared contact, e.g. ' +
        'SEC_USER_AGENT="Your Name your@email.com". See .env.example.'
    );
  }
  return ua.trim();
}

// --- request throttle -------------------------------------------------------
// Serialized queue with a minimum gap. Deliberately below SEC's 10/sec ceiling.
const MIN_INTERVAL_MS = 125;
let lastRequestAt = 0;
let chain = Promise.resolve();

function schedule(fn) {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

// --- disk cache -------------------------------------------------------------

function cachePath(url) {
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 32);
  return path.join(CACHE_DIR, `${hash}.json`);
}

async function readCache(url, maxAgeMs) {
  if (maxAgeMs === 0) return null;
  try {
    const raw = await fs.readFile(cachePath(url), 'utf8');
    const entry = JSON.parse(raw);
    if (maxAgeMs != null && Date.now() - entry.at > maxAgeMs) return null;
    return entry.body;
  } catch {
    return null;
  }
}

async function writeCache(url, body) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${cachePath(url)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ at: Date.now(), url, body }), 'utf8');
  await fs.rename(tmp, cachePath(url));
}

/**
 * Fetches a URL from SEC with the required headers, a rate limit, retries on
 * 429/5xx, and a disk cache. Filing documents are immutable once accepted, so
 * they are cached indefinitely (`maxAgeMs: null`); index endpoints pass a TTL.
 */
export async function secFetch(url, { maxAgeMs = null, retries = 3 } = {}) {
  const cached = await readCache(url, maxAgeMs);
  if (cached != null) return cached;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const body = await schedule(async () => {
        const response = await fetch(url, {
          headers: {
            'User-Agent': userAgent(),
            'Accept-Encoding': 'gzip, deflate',
          },
        });

        if (response.status === 429 || response.status >= 500) {
          const err = new Error(`SEC responded ${response.status} for ${url}`);
          err.retryable = true;
          throw err;
        }
        if (response.status === 404) {
          const err = new Error(`Not found at SEC: ${url}`);
          err.notFound = true;
          throw err;
        }
        if (!response.ok) {
          throw new Error(`SEC responded ${response.status} for ${url}`);
        }
        return response.text();
      });

      await writeCache(url, body);
      return body;
    } catch (error) {
      lastError = error;
      if (!error.retryable || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

export async function secFetchJson(url, options) {
  const text = await secFetch(url, options);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url} but got something else.`);
  }
}

export const TTL = {
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
};
