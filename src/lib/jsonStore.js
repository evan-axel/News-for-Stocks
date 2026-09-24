import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * A small append-safe JSON collection on disk.
 *
 * Two properties matter and both are easy to lose: writes are atomic
 * (write-then-rename, so an interrupted write cannot truncate the file), and
 * read-modify-write cycles are serialized (without the lock, two concurrent
 * requests both read the same array and the second write discards the first).
 */
export function createStore(filename) {
  const filePath = path.join(DATA_DIR, filename);
  let queue = Promise.resolve();

  async function ensureFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, '[]', 'utf8');
    }
  }

  async function readAll() {
    await ensureFile();
    const raw = await fs.readFile(filePath, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Never silently reset a file we failed to parse — keep a copy first.
      const backup = `${filePath}.corrupt-${Date.now()}`;
      await fs.copyFile(filePath, backup);
      throw new Error(
        `data/${filename} is not valid JSON. A copy was saved to ${path.basename(backup)}; fix or remove the original.`
      );
    }
  }

  async function writeAll(rows) {
    await ensureFile();
    const tmp = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf8');
    await fs.rename(tmp, filePath);
  }

  /**
   * Runs `mutator(rows)` under the write lock. The mutator returns
   * `{ rows, result }`; `rows` is persisted and `result` returned to the caller.
   */
  function transact(mutator) {
    const run = queue.then(async () => {
      const rows = await readAll();
      const { rows: nextRows, result } = await mutator(rows);
      await writeAll(nextRows);
      return result;
    });
    // Keep the chain alive even if this transaction rejected.
    queue = run.catch(() => {});
    return run;
  }

  return { readAll, transact, filePath };
}
