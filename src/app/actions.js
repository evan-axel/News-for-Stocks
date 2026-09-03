'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createThesis,
  resolveFalsifier,
  addFalsifier,
  addRevision,
  closeThesis,
} from '@/lib/theses';

function ok(result) {
  return { ok: true, error: null, ...result };
}

function fail(error) {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export async function createThesisAction(payload) {
  let thesis;
  try {
    thesis = await createThesis(payload);
  } catch (error) {
    return fail(error);
  }
  revalidatePath('/');
  // redirect() throws internally, so it must sit outside the try/catch.
  redirect(`/thesis/${thesis.id}`);
}

export async function resolveFalsifierAction(thesisId, falsifierId, payload) {
  try {
    await resolveFalsifier(thesisId, falsifierId, payload);
  } catch (error) {
    return fail(error);
  }
  revalidatePath('/');
  revalidatePath(`/thesis/${thesisId}`);
  return ok();
}

export async function addFalsifierAction(thesisId, payload) {
  try {
    await addFalsifier(thesisId, payload);
  } catch (error) {
    return fail(error);
  }
  revalidatePath('/');
  revalidatePath(`/thesis/${thesisId}`);
  return ok();
}

export async function addRevisionAction(thesisId, note) {
  try {
    await addRevision(thesisId, note);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/thesis/${thesisId}`);
  return ok();
}

export async function closeThesisAction(thesisId, payload) {
  try {
    await closeThesis(thesisId, payload);
  } catch (error) {
    return fail(error);
  }
  revalidatePath('/');
  revalidatePath(`/thesis/${thesisId}`);
  return ok();
}
