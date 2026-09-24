import { NextResponse } from 'next/server';
import { loadFilings, filterFilings } from '@/lib/sec/filings';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const cik = params.get('cik');
  if (!cik) return NextResponse.json({ error: 'cik is required' }, { status: 400 });

  const forms = params.getAll('form').filter(Boolean);
  const items = params.getAll('item').filter(Boolean);
  const deep = params.get('deep') === '1';
  const limit = Math.min(Number(params.get('limit')) || 100, 500);

  try {
    const { company, filings } = await loadFilings(cik, { deep });
    const filtered = filterFilings(filings, {
      forms,
      items,
      from: params.get('from') || '',
      to: params.get('to') || '',
      q: params.get('q') || '',
    });

    return NextResponse.json({
      company,
      total: filtered.length,
      truncated: filtered.length > limit,
      filings: filtered.slice(0, limit),
    });
  } catch (error) {
    const status = error.notFound ? 404 : 502;
    return NextResponse.json({ error: error.message }, { status });
  }
}
