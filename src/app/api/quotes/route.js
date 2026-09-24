import { NextResponse } from 'next/server';
import { callCapability, providerFor } from '@/lib/market';

export const dynamic = 'force-dynamic';

/**
 * Batch quotes for the coverage grid. Returns a map keyed by ticker; a ticker
 * the provider could not serve is simply absent rather than failing the call,
 * so one bad symbol never blanks the grid.
 */
export async function GET(request) {
  const tickers = (request.nextUrl.searchParams.get('tickers') || '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 100);

  if (!tickers.length) return NextResponse.json({ quotes: {}, available: false });
  if (!providerFor('quote')) {
    return NextResponse.json({ quotes: {}, available: false, message: 'No quote provider configured.' });
  }

  const results = await Promise.all(
    tickers.map(async (ticker) => [ticker, await callCapability('quote', ticker)])
  );

  const quotes = {};
  for (const [ticker, result] of results) {
    if (result.ok && result.data) quotes[ticker] = result.data;
  }

  return NextResponse.json({ quotes, available: true });
}
