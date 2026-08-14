import { formatMoney, formatPercent } from '../enrich/derive.js';
import type { CompanyContext, FinancialTrend } from '../types.js';

/** Oldest-to-newest row of a metric, e.g. "FY2021 12.4% · FY2022 15.1% · …". */
function series(trend: FinancialTrend, values: (number | null)[], fmt: (v: number | null) => string): string {
  return trend.periods
    .map((p, i) => `${p.label} ${fmt(values[i] ?? null)}`)
    .reverse()
    .join(' · ');
}

function renderTrend(label: string, trend: FinancialTrend | null): string {
  if (!trend || trend.periods.length === 0) return `${label}: not available`;

  const revenue = trend.periods
    .map((p) => `${p.label} ${formatMoney(p.revenue)}`)
    .reverse()
    .join(' · ');

  const lines = [
    `${label}:`,
    `  Revenue:        ${revenue}`,
    `  Rev growth YoY: ${series(trend, trend.revenueGrowthYoY, (v) => formatPercent(v))}`,
    `  Gross margin:   ${series(trend, trend.grossMargin, (v) => formatPercent(v))}`,
    `  Op margin:      ${series(trend, trend.operatingMargin, (v) => formatPercent(v))}`,
    `  Net margin:     ${series(trend, trend.netMargin, (v) => formatPercent(v))}`,
    `  Free cash flow: ${trend.periods.map((p) => `${p.label} ${formatMoney(p.freeCashFlow)}`).reverse().join(' · ')}`,
    `  FCF margin:     ${series(trend, trend.fcfMargin, (v) => formatPercent(v))}`,
  ];

  if (trend.revenueCagr3y !== null) lines.push(`  Revenue CAGR 3y: ${formatPercent(trend.revenueCagr3y)}`);
  if (trend.revenueCagr5y !== null) lines.push(`  Revenue CAGR 5y: ${formatPercent(trend.revenueCagr5y)}`);

  const newest = trend.periods[0];
  if (newest) {
    lines.push(
      `  Balance sheet (${newest.label}): cash ${formatMoney(newest.cash)}, debt ${formatMoney(newest.totalDebt)}`,
    );
  }

  return lines.join('\n');
}

/**
 * Flatten a CompanyContext into the compact text block the model reasons over.
 *
 * Everything unavailable is written as an explicit "not available" rather than
 * omitted — a silent gap invites the model to fill it in from memory, and a
 * hallucinated market cap in an investment alert is the worst possible failure.
 */
export function renderCompanyContext(ctx: CompanyContext): string {
  const { ref, profile, quote } = ctx;

  const header = [
    `Company: ${ref.name} (${ref.ticker}${ref.exchange ? ` · ${ref.exchange}` : ''})`,
    `Market cap: ${formatMoney(quote.marketCap, quote.currency)}`,
    `Price: ${formatMoney(quote.price, quote.currency)}${
      quote.changePercent !== null ? ` (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}% today)` : ''
    }`,
    `Sector / industry: ${profile.sector ?? 'n/a'} / ${profile.industry ?? 'n/a'}`,
    profile.employees !== null ? `Employees: ${profile.employees.toLocaleString()}` : null,
    profile.ipoDate ? `Listed since: ${profile.ipoDate}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const description = profile.description
    ? `\nBusiness: ${profile.description.slice(0, 600)}`
    : '';

  const execs = ctx.executives.length
    ? `\nManagement:\n${ctx.executives
        .slice(0, 8)
        .map(
          (e) =>
            `  ${e.name} — ${e.title}${e.since ? ` (since ${e.since})` : ''}${
              e.payTotal ? `, total comp ${formatMoney(e.payTotal)}` : ''
            }`,
        )
        .join('\n')}`
    : '\nManagement: not available';

  const insiders = ctx.insiderTrades.length
    ? `\nRecent insider transactions:\n${ctx.insiderTrades
        .slice(0, 10)
        .map(
          (t) =>
            `  ${t.filedAt} ${t.direction.toUpperCase()} ${
              t.shares !== null ? t.shares.toLocaleString() : '?'
            } sh${t.value !== null ? ` (${formatMoney(t.value)})` : ''} — ${t.insiderName}, ${t.insiderTitle}`,
        )
        .join('\n')}`
    : '\nRecent insider transactions: not available';

  const provenance = [
    `\nData sources: ${ctx.sources.length ? ctx.sources.join(', ') : 'none responded'}`,
    `Fetched: ${ctx.fetchedAt.toISOString()}`,
    ctx.warnings.length ? `Gaps: ${ctx.warnings.join(' ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    header,
    description,
    '',
    renderTrend('Annual financials', ctx.annual),
    '',
    renderTrend('Quarterly financials', ctx.quarterly),
    execs,
    insiders,
    provenance,
  ].join('\n');
}
