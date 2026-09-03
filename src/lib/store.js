import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'theses.json');

// Serializes read-modify-write cycles. Without this, two concurrent server
// actions can both read the same array and the second write silently discards
// the first one's change.
let queue = Promise.resolve();

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, '[]', 'utf8');
  }
}

export async function readAll() {
  await ensureFile();
  const raw = await fs.readFile(DB_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Never silently reset a journal we failed to parse — keep a copy first.
    const backup = `${DB_PATH}.corrupt-${Date.now()}`;
    await fs.copyFile(DB_PATH, backup);
    throw new Error(
      `data/theses.json is not valid JSON. A copy was saved to ${path.basename(backup)}; fix or remove the original.`
    );
  }
}

async function writeAll(rows) {
  await ensureFile();
  // Write-then-rename so an interrupted write can't truncate the journal.
  const tmp = `${DB_PATH}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf8');
  await fs.rename(tmp, DB_PATH);
}

/**
 * Runs `mutator(rows)` under the write lock and persists whatever it returns.
 * The mutator's return value is written; its second return slot (via an object
 * `{ rows, result }`) is passed back to the caller.
 */
export function transact(mutator) {
  const run = queue.then(async () => {
    const rows = await readAll();
    const outcome = await mutator(rows);
    const { rows: nextRows, result } = outcome;
    await writeAll(nextRows);
    return result;
  });
  // Keep the chain alive even if this transaction rejected.
  queue = run.catch(() => {});
  return run;
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}
