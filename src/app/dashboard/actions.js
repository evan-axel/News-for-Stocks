'use server';

import { revalidatePath } from 'next/cache';
import {
  addCoverage,
  updateCoverage,
  removeCoverage,
  setEstimate,
  removeEstimate,
  addCatalyst,
  updateCatalyst,
  removeCatalyst,
} from '@/lib/coverage/store';

function fail(error) {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

async function run(fn, paths = ['/dashboard']) {
  try {
    const result = await fn();
    for (const path of paths) revalidatePath(path);
    return { ok: true, result: JSON.parse(JSON.stringify(result ?? null)) };
  } catch (error) {
    return fail(error);
  }
}

export const addCoverageAction = (input) => run(() => addCoverage(input));
export const updateCoverageAction = (id, input) => run(() => updateCoverage(id, input));
export const removeCoverageAction = (id) => run(() => removeCoverage(id));
export const setEstimateAction = (id, estimate) => run(() => setEstimate(id, estimate));
export const removeEstimateAction = (id, fy) => run(() => removeEstimate(id, fy));
export const addCatalystAction = (id, catalyst) => run(() => addCatalyst(id, catalyst));
export const updateCatalystAction = (id, catalystId, patch) =>
  run(() => updateCatalyst(id, catalystId, patch));
export const removeCatalystAction = (id, catalystId) => run(() => removeCatalyst(id, catalystId));
