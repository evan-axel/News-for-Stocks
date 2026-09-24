import { NextResponse } from 'next/server';
import { loadFilings } from '@/lib/sec/filings';
import { callCapability, capabilityStatus } from '@/lib/market';
import { getCoverage } from '@/lib/coverage/store';
import { earningsReactions, valuationHistory, estimateComparison } from '@/lib/coverage/analysis';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Everything the name view needs, assembled in one request.
 *
 * Each source is independent: a missing price provider removes the valuation
 * and reaction panels but leaves fundamentals, filings and estimate
 * comparisons intact. Nothing here throws on an unconfigured vendor.
 */
export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const cik = params.get('cik');
  const ticker = (params.get('ticker') || '').toUpperCase();
  const id = params.get('id');
  if (!cik) return NextResponse.json({ error: 'cik is required' }, { status: 400 });

  const coverage = id ? await getCoverage(id) : ticker ? await getCoverage(ticker) : null;

  const [annualResult, quarterResult, filingsResult, quoteResult, priceResult, streetResult] =
    await Promise.all([
      callCapability('fundamentals', cik, { frequency: 'annual', limit: 10 }),
      callCapability('fundamentals', cik, { frequency: 'quarterly', limit: 24 }),
      // Deep: the reaction panel and the filing feed are both history views, and
      // the one-year `recent` window would show a single quarter. Index pages
      // are cached, so the cost is paid once.
      loadFilings(cik, { deep: true }).then(
        (r) => ({ ok: true, data: r }),
        (e) => ({ ok: false, message: e.message })
      ),
      ticker ? callCapability('quote', ticker) : Promise.resolve({ ok: false, reason: 'no-ticker' }),
      ticker
        ? callCapability('priceHistory', ticker, { from: isoYearsAgo(6) })
        : Promise.resolve({ ok: false, reason: 'no-ticker' }),
      ticker
        ? callCapability('estimates', ticker, { period: 'annual', limit: 8 })
        : Promise.resolve({ ok: false, reason: 'no-ticker' }),
    ]);

  const annual = annualResult.ok ? annualResult.data : null;
  const quarterly = quarterResult.ok ? quarterResult.data : null;
  const filings = filingsResult.ok ? filingsResult.data.filings : [];
  const company = filingsResult.ok ? filingsResult.data.company : null;
  const closes = priceResult.ok ? priceResult.data.closes : [];

  const reactions = closes.length ? earningsReactions(closes, filings) : [];
  const valuation = closes.length && quarterly?.periods?.length
    ? valuationHistory(closes, quarterly.periods)
    : null;

  const estimates = estimateComparison({
    myEstimates: coverage?.myEstimates || [],
    street: streetResult.ok ? streetResult.data.rows : [],
    actuals: annual?.periods || [],
  });

  return NextResponse.json({
    cik,
    ticker,
    company,
    coverage,
    capabilities: capabilityStatus(),
    fundamentals: {
      annual,
      quarterly,
      error: annualResult.ok ? null : annualResult.message,
    },
    quote: quoteResult.ok ? quoteResult.data : null,
    quoteError: quoteResult.ok ? null : quoteResult.message || null,
    price: { closes, error: priceResult.ok ? null : priceResult.message || null },
    street: {
      rows: streetResult.ok ? streetResult.data.rows : [],
      error: streetResult.ok ? null : streetResult.message || null,
    },
    estimates,
    reactions,
    valuation,
    filings: filings.slice(0, 40),
  });
}

function isoYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}
