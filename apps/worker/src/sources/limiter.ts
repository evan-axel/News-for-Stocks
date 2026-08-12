/**
 * Minimal sequential rate limiter. SEC asks for no more than 10 requests per
 * second from a single agent and will block a UA that ignores it, so every
 * sec.gov call in this codebase funnels through `secLimiter`.
 */
export class RateLimiter {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly minIntervalMs: number) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const started = Date.now();
      try {
        return await fn();
      } finally {
        const elapsed = Date.now() - started;
        const wait = this.minIntervalMs - elapsed;
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    });
    // Keep the chain alive even when a call rejects.
    this.queue = result.catch(() => undefined);
    return result;
  }
}

/** ~5 requests/second, comfortably inside SEC's published limit. */
export const secLimiter = new RateLimiter(200);
