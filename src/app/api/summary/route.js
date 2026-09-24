import { NextResponse } from 'next/server';
import { getFiling } from '@/lib/sec/filings';
import { loadFilingText } from '@/lib/sec/document';
import { summarizeFiling, readCachedSummary } from '@/lib/ai/summarize';
import { describeError, hasApiKey } from '@/lib/ai/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Returns a cached summary if one exists, without spending a request. */
export async function GET(request) {
  const accession = request.nextUrl.searchParams.get('accession');
  if (!accession) return NextResponse.json({ error: 'accession is required' }, { status: 400 });

  const summary = await readCachedSummary(accession);
  return NextResponse.json({ summary, available: hasApiKey() });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { cik, accession, force = false } = body || {};
  if (!cik || !accession) {
    return NextResponse.json({ error: 'cik and accession are required' }, { status: 400 });
  }

  try {
    const { filing } = await getFiling(cik, accession);
    if (!filing) return NextResponse.json({ error: 'Filing not found' }, { status: 404 });

    const { text } = await loadFilingText(filing);
    if (!text.trim()) {
      return NextResponse.json({ error: 'No readable text in this filing.' }, { status: 422 });
    }

    const summary = await summarizeFiling(filing, text, { force });
    return NextResponse.json({ summary });
  } catch (error) {
    const { status, message } = describeError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
