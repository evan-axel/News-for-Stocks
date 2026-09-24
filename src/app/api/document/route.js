import { NextResponse } from 'next/server';
import { getFiling } from '@/lib/sec/filings';
import { loadFilingText, findSections } from '@/lib/sec/document';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const cik = params.get('cik');
  const accession = params.get('accession');
  if (!cik || !accession) {
    return NextResponse.json({ error: 'cik and accession are required' }, { status: 400 });
  }

  try {
    const { filing } = await getFiling(cik, accession);
    if (!filing) return NextResponse.json({ error: 'Filing not found' }, { status: 404 });

    const { text, url } = await loadFilingText(filing);
    return NextResponse.json({
      filing,
      sourceUrl: url,
      chars: text.length,
      sections: findSections(text),
      text,
    });
  } catch (error) {
    const status = error.notFound ? 404 : 502;
    return NextResponse.json({ error: error.message }, { status });
  }
}
