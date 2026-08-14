import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../db/index.js';
import { Repo } from '../db/repo.js';
import { getTranscript, listTranscripts, setProviders } from './company.js';
import type { FinancialsProvider } from './provider.js';
import type { CompanyRef, Transcript, TranscriptRef } from '../types.js';

const REF: CompanyRef = { ticker: 'ACME', name: 'Acme Corporation' };

function transcript(year: number, quarter: number, content = 'call text'): Transcript {
  return {
    ticker: 'ACME',
    period: `Q${quarter} ${year}`,
    date: `${year}-0${quarter}-15`,
    content,
    source: 'TestProvider',
    fiscalYear: year,
    fiscalQuarter: quarter,
    kind: 'call_transcript',
  };
}

/** Records how many times each capability was called. */
function stubProvider(overrides: Partial<FinancialsProvider> = {}) {
  const calls = { get: 0, list: 0 };
  const provider: FinancialsProvider = {
    id: 'stub',
    configured: true,
    async getTranscript(_ref, opts) {
      calls.get++;
      const year = opts?.year ?? 2025;
      const quarter = opts?.quarter ?? 3;
      return transcript(year, quarter);
    },
    async listTranscripts(): Promise<TranscriptRef[]> {
      calls.list++;
      return [
        { year: 2025, quarter: 3, date: '2025-03-15', cached: false },
        { year: 2025, quarter: 2, date: '2025-02-15', cached: false },
      ];
    },
    ...overrides,
  };
  return { provider, calls };
}

let repo: Repo;

beforeEach(() => {
  repo = new Repo(createMemoryDb());
});

afterEach(() => {
  setProviders(null);
});

describe('getTranscript', () => {
  it('fetches from the provider and persists the result', async () => {
    const { provider, calls } = stubProvider();
    setProviders([provider]);

    const first = await getTranscript(REF, repo);
    expect(first?.period).toBe('Q3 2025');
    expect(calls.get).toBe(1);

    expect(repo.getCachedTranscript('ACME')?.content).toBe('call text');
  });

  it('serves the second request from cache without calling the provider', async () => {
    const { provider, calls } = stubProvider();
    setProviders([provider]);

    await getTranscript(REF, repo);
    await getTranscript(REF, repo);

    expect(calls.get).toBe(1);
  });

  it('refetches when fresh is requested', async () => {
    const { provider, calls } = stubProvider();
    setProviders([provider]);

    await getTranscript(REF, repo);
    await getTranscript(REF, repo, { fresh: true });

    expect(calls.get).toBe(2);
  });

  it('keeps quarters separate rather than overwriting one another', async () => {
    const { provider } = stubProvider();
    setProviders([provider]);

    await getTranscript(REF, repo, { year: 2025, quarter: 3 });
    await getTranscript(REF, repo, { year: 2025, quarter: 2 });

    expect(repo.listCachedTranscripts('ACME')).toHaveLength(2);
    expect(repo.getCachedTranscript('ACME', { year: 2025, quarter: 2 })?.period).toBe('Q2 2025');
  });

  it('returns the newest cached quarter by fiscal period, not by fetch order', async () => {
    const { provider } = stubProvider();
    setProviders([provider]);

    // Fetch the older quarter last; "latest" must still be Q3.
    await getTranscript(REF, repo, { year: 2025, quarter: 3 });
    await getTranscript(REF, repo, { year: 2025, quarter: 2 });

    expect(repo.getCachedTranscript('ACME')?.period).toBe('Q3 2025');
  });

  it('falls through to the next provider when the first serves nothing', async () => {
    const empty: FinancialsProvider = {
      id: 'empty',
      configured: true,
      async getTranscript() {
        return null;
      },
    };
    const { provider, calls } = stubProvider();
    setProviders([empty, provider]);

    const result = await getTranscript(REF, repo);
    expect(result?.source).toBe('TestProvider');
    expect(calls.get).toBe(1);
  });

  it('survives a provider that throws', async () => {
    const broken: FinancialsProvider = {
      id: 'broken',
      configured: true,
      async getTranscript(): Promise<Transcript | null> {
        throw new Error('upstream 500');
      },
    };
    const { provider } = stubProvider();
    setProviders([broken, provider]);

    expect((await getTranscript(REF, repo))?.period).toBe('Q3 2025');
  });

  it('returns null when nothing serves a transcript and there is no CIK', async () => {
    setProviders([{ id: 'none', configured: true }]);
    expect(await getTranscript(REF, repo)).toBeNull();
  });
});

describe('listTranscripts', () => {
  it('flags which listed quarters are already downloaded', async () => {
    const { provider } = stubProvider();
    setProviders([provider]);

    await getTranscript(REF, repo, { year: 2025, quarter: 3 });
    const list = await listTranscripts(REF, repo);

    expect(list.find((r) => r.quarter === 3)?.cached).toBe(true);
    expect(list.find((r) => r.quarter === 2)?.cached).toBe(false);
  });

  it('falls back to reporting only cached quarters when no provider lists any', async () => {
    const onlyGet: FinancialsProvider = {
      id: 'onlyGet',
      configured: true,
      async getTranscript() {
        return transcript(2024, 4);
      },
    };
    setProviders([onlyGet]);

    await getTranscript(REF, repo);
    const list = await listTranscripts(REF, repo);

    expect(list).toEqual([{ year: 2024, quarter: 4, date: '2024-04-15', cached: true }]);
  });

  it('returns an empty list when nothing is known', async () => {
    setProviders([{ id: 'none', configured: true }]);
    expect(await listTranscripts(REF, repo)).toEqual([]);
  });
});
