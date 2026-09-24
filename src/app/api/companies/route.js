import { NextResponse } from 'next/server';
import { searchCompanies } from '@/lib/sec/companies';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const q = request.nextUrl.searchParams.get('q') || '';
  if (!q.trim()) return NextResponse.json({ companies: [] });

  try {
    const companies = await searchCompanies(q, 15);
    return NextResponse.json({ companies });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
