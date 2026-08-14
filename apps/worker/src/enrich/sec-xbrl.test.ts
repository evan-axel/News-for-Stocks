import { describe, expect, it } from 'vitest';
import { buildPeriodsFromFacts } from './sec-xbrl.js';

/** Minimal companyfacts shape, matching SEC's real structure. */
function facts(usGaap: Record<string, { units: Record<string, unknown[]> }>) {
  return { cik: 1, entityName: 'Test Co', facts: { 'us-gaap': usGaap } } as never;
}

const annualRevenue = (end: string, start: string, val: number, filed: string) => ({
  start,
  end,
  val,
  accn: `acc-${end}`,
  form: '10-K',
  fp: 'FY',
  filed,
});

describe('buildPeriodsFromFacts', () => {
  it('extracts annual periods from 10-K duration facts', () => {
    const f = facts({
      Revenues: {
        units: {
          USD: [
            annualRevenue('2024-12-31', '2024-01-01', 200, '2025-02-01'),
            annualRevenue('2023-12-31', '2023-01-01', 150, '2024-02-01'),
          ],
        },
      },
    });

    const periods = buildPeriodsFromFacts(f, 'annual', 8);
    expect(periods.map((p) => p.label)).toEqual(['FY2024', 'FY2023']);
    expect(periods[0]?.revenue).toBe(200);
  });

  it('ignores quarterly durations when asking for annual', () => {
    const f = facts({
      Revenues: {
        units: {
          USD: [
            annualRevenue('2024-12-31', '2024-01-01', 200, '2025-02-01'),
            // A Q4 stub filed inside the same 10-K.
            { start: '2024-10-01', end: '2024-12-31', val: 60, accn: 'q', form: '10-K', filed: '2025-02-01' },
          ],
        },
      },
    });

    const periods = buildPeriodsFromFacts(f, 'annual', 8);
    expect(periods).toHaveLength(1);
    expect(periods[0]?.revenue).toBe(200);
  });

  it('picks quarterly durations when asking for quarterly', () => {
    const f = facts({
      Revenues: {
        units: {
          USD: [
            { start: '2024-07-01', end: '2024-09-30', val: 55, accn: 'q3', form: '10-Q', filed: '2024-10-20' },
            annualRevenue('2024-12-31', '2024-01-01', 200, '2025-02-01'),
          ],
        },
      },
    });

    const periods = buildPeriodsFromFacts(f, 'quarterly', 8);
    expect(periods).toHaveLength(1);
    expect(periods[0]?.revenue).toBe(55);
  });

  it('prefers the most recently filed value for a restated period', () => {
    const f = facts({
      Revenues: {
        units: {
          USD: [
            annualRevenue('2023-12-31', '2023-01-01', 150, '2024-02-01'),
            annualRevenue('2023-12-31', '2023-01-01', 145, '2025-02-01'), // restatement
          ],
        },
      },
    });

    const periods = buildPeriodsFromFacts(f, 'annual', 8);
    expect(periods[0]?.revenue).toBe(145);
  });

  it('falls back through alternative revenue tags', () => {
    const f = facts({
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: { USD: [annualRevenue('2024-12-31', '2024-01-01', 300, '2025-02-01')] },
      },
    });
    expect(buildPeriodsFromFacts(f, 'annual', 8)[0]?.revenue).toBe(300);
  });

  it('derives free cash flow from operating cash flow and capex', () => {
    const f = facts({
      Revenues: { units: { USD: [annualRevenue('2024-12-31', '2024-01-01', 200, '2025-02-01')] } },
      NetCashProvidedByUsedInOperatingActivities: {
        units: { USD: [annualRevenue('2024-12-31', '2024-01-01', 60, '2025-02-01')] },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: { USD: [annualRevenue('2024-12-31', '2024-01-01', 25, '2025-02-01')] },
      },
    });

    const p = buildPeriodsFromFacts(f, 'annual', 8)[0];
    expect(p?.freeCashFlow).toBe(35);
  });

  it('reads instant concepts at the period end date', () => {
    const f = facts({
      Revenues: { units: { USD: [annualRevenue('2024-12-31', '2024-01-01', 200, '2025-02-01')] } },
      CashAndCashEquivalentsAtCarryingValue: {
        units: { USD: [{ end: '2024-12-31', val: 90, accn: 'bs', form: '10-K', filed: '2025-02-01' }] },
      },
      LongTermDebtNoncurrent: {
        units: { USD: [{ end: '2024-12-31', val: 400, accn: 'bs', form: '10-K', filed: '2025-02-01' }] },
      },
      LongTermDebtCurrent: {
        units: { USD: [{ end: '2024-12-31', val: 50, accn: 'bs', form: '10-K', filed: '2025-02-01' }] },
      },
    });

    const p = buildPeriodsFromFacts(f, 'annual', 8)[0];
    expect(p?.cash).toBe(90);
    expect(p?.totalDebt).toBe(450);
  });

  it('does not borrow a balance-sheet value from a distant date', () => {
    const f = facts({
      Revenues: { units: { USD: [annualRevenue('2024-12-31', '2024-01-01', 200, '2025-02-01')] } },
      CashAndCashEquivalentsAtCarryingValue: {
        units: { USD: [{ end: '2020-12-31', val: 90, accn: 'old', form: '10-K', filed: '2021-02-01' }] },
      },
    });
    expect(buildPeriodsFromFacts(f, 'annual', 8)[0]?.cash).toBeNull();
  });

  it('returns an empty list when the company has no usable facts', () => {
    expect(buildPeriodsFromFacts(facts({}), 'annual', 8)).toEqual([]);
  });

  it('respects the requested limit, newest first', () => {
    const units = Array.from({ length: 10 }, (_, i) => {
      const year = 2024 - i;
      return annualRevenue(`${year}-12-31`, `${year}-01-01`, 100 + i, `${year + 1}-02-01`);
    });
    const periods = buildPeriodsFromFacts(facts({ Revenues: { units: { USD: units } } }), 'annual', 4);
    expect(periods).toHaveLength(4);
    expect(periods[0]?.label).toBe('FY2024');
    expect(periods[3]?.label).toBe('FY2021');
  });
});
