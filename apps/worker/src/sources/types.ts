import type { RawItem, SourceKind } from '../types.js';

export interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  /**
   * Return everything the source currently offers. Filtering by age and dedupe
   * happen centrally in the scan pipeline, so a source should not try to be
   * clever about what is "new" — it just reports what it sees.
   */
  fetch(): Promise<RawItem[]>;
}

export interface SourceResult {
  sourceId: string;
  items: RawItem[];
  error: Error | null;
  durationMs: number;
}

export type { RawItem, SourceKind };
