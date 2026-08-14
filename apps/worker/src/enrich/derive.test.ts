import { describe, expect, it } from 'vitest';
import { buildTrend, cagr, formatMoney, formatPercent } from './derive.js';
import { emptyPeriod } from './provider.js';
import type { FinancialPeriod } from '../types.js';

function period(label: string, values: Partial<FinancialPeriod>): FinancialPeriod {
  return { ...emptyPeriod(label, `${label.replace('FY', '')}-12-31`), ...values };
}

describe('cagr', () => {
  it('computes compound growth', () => {
    // 100 -> 200 over 3 years ≈ 25.99%
    expect(cagr(200, 100, 3)).toBeCloseTo(0.2599, 3);
  });

  it('returns null across a sign change or a zero base', () => {
    expect(cagr(200, -100, 3)).toBeNull();
    expect(cagr(200, 0, 3)).toBeNull();
    expect(cagr(-200, 100, 3)).toBeNull();
  });

  it('returns null on missing endpoints', () => {
    expect(cagr(null, 100, 3)).toBeNull();
    expect(cagr(200, null, 3)).toBeNull();
  });
});

describe('buildTrend', () => {
  const periods = [
    period('FY2025', { revenue: 200, grossProfit: 120, operatingIncome: 40, netIncome: 30, operatingCashFlow: 50, capex: -10 }),
    period('FY2024', { revenue: 160, grossProfit: 90, operatingIncome: 25, netIncome: 18, operatingCashFlow: 35, capex: -8 }),
    period('FY2023', { revenue: 120, grossProfit: 60, operatingIncome: 10, netIncome: 5, operatingCashFlow: 20, capex: -5 }),
    period('FY2022', { revenue: 100, grossProfit: 45, operatingIncome: 2, netIncome: -1, operatingCashFlow: 10, capex: -4 }),
  ];

  it('computes YoY growth against the next-older period', () => {
    const trend = buildTrend(periods);
    expect(trend.revenueGrowthYoY[0]).toBeCloseTo(0.25, 5); // 160 -> 200
    expect(trend.revenueGrowthYoY[1]).toBeCloseTo(1 / 3, 5); // 120 -> 160
    // Oldest period has nothing to compare against.
    expect(trend.revenueGrowthYoY[3]).toBeNull();
  });

  it('computes margins', () => {
    const trend = buildTrend(periods);
    expect(trend.grossMargin[0]).toBeCloseTo(0.6, 5);
    expect(trend.operatingMargin[0]).toBeCloseTo(0.2, 5);
    expect(trend.netMargin[0]).toBeCloseTo(0.15, 5);
  });

  it('derives free cash flow as OCF minus absolute capex', () => {
    const trend = buildTrend(periods);
    expect(trend.periods[0]?.freeCashFlow).toBe(40); // 50 - |−10|
    expect(trend.fcfMargin[0]).toBeCloseTo(0.2, 5);
  });

  it('treats capex sign consistently whichever way the provider reports it', () => {
    const negative = buildTrend([period('FY2025', { revenue: 100, operatingCashFlow: 50, capex: -10 })]);
    const positive = buildTrend([period('FY2025', { revenue: 100, operatingCashFlow: 50, capex: 10 })]);
    expect(negative.periods[0]?.freeCashFlow).toBe(40);
    expect(positive.periods[0]?.freeCashFlow).toBe(40);
  });

  it('prefers a provider-supplied free cash flow over the derived one', () => {
    const trend = buildTrend([
      period('FY2025', { revenue: 100, operatingCashFlow: 50, capex: -10, freeCashFlow: 37 }),
    ]);
    expect(trend.periods[0]?.freeCashFlow).toBe(37);
  });

  it('computes 3y CAGR only with enough periods', () => {
    expect(buildTrend(periods).revenueCagr3y).toBeCloseTo(0.2599, 3); // 100 -> 200
    expect(buildTrend(periods.slice(0, 2)).revenueCagr3y).toBeNull();
    expect(buildTrend(periods).revenueCagr5y).toBeNull();
  });

  it('returns nulls rather than throwing on missing data', () => {
    const trend = buildTrend([period('FY2025', {}), period('FY2024', {})]);
    expect(trend.grossMargin[0]).toBeNull();
    expect(trend.revenueGrowthYoY[0]).toBeNull();
    expect(trend.periods[0]?.freeCashFlow).toBeNull();
  });

  it('suppresses growth computed off a negative base', () => {
    const trend = buildTrend([
      period('FY2025', { revenue: 50 }),
      period('FY2024', { revenue: -10 }),
    ]);
    expect(trend.revenueGrowthYoY[0]).toBeNull();
  });

  it('handles an empty period list', () => {
    const trend = buildTrend([]);
    expect(trend.periods).toEqual([]);
    expect(trend.revenueCagr3y).toBeNull();
  });
});

describe('formatting', () => {
  it('scales money to human units', () => {
    expect(formatMoney(1_500_000_000)).toBe('$1.50B');
    expect(formatMoney(2_400_000)).toBe('$2.4M');
    expect(formatMoney(-2_400_000)).toBe('-$2.4M');
    expect(formatMoney(null)).toBe('n/a');
  });

  it('formats percentages', () => {
    expect(formatPercent(0.1234)).toBe('12.3%');
    expect(formatPercent(null)).toBe('n/a');
  });
});
