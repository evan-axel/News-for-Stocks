/**
 * us-gaap concept mappings.
 *
 * Filers tag the same line item with different concepts depending on era and
 * industry — revenue alone has four common spellings, and a company that
 * adopted ASC 606 changed which one it uses mid-history. Each line is therefore
 * a fallback chain, tried in order, first one with data wins.
 */

export const INCOME_STATEMENT = [
  {
    key: 'revenue',
    label: 'Revenue',
    concepts: [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'SalesRevenueGoodsNet',
      'TotalRevenuesAndOtherIncome',
    ],
  },
  {
    key: 'costOfRevenue',
    label: 'Cost of revenue',
    concepts: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'],
  },
  { key: 'grossProfit', label: 'Gross profit', concepts: ['GrossProfit'], derive: (r) => sub(r.revenue, r.costOfRevenue) },
  {
    key: 'rnd',
    label: 'R&D',
    concepts: ['ResearchAndDevelopmentExpense'],
  },
  {
    key: 'sgna',
    label: 'SG&A',
    concepts: [
      'SellingGeneralAndAdministrativeExpense',
      'GeneralAndAdministrativeExpense',
    ],
  },
  {
    key: 'operatingIncome',
    label: 'Operating income',
    concepts: ['OperatingIncomeLoss'],
  },
  {
    key: 'interestExpense',
    label: 'Interest expense',
    concepts: ['InterestExpense', 'InterestExpenseDebt', 'InterestIncomeExpenseNet'],
  },
  {
    key: 'pretaxIncome',
    label: 'Pre-tax income',
    concepts: [
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
    ],
  },
  {
    key: 'taxExpense',
    label: 'Income tax',
    concepts: ['IncomeTaxExpenseBenefit'],
  },
  { key: 'netIncome', label: 'Net income', concepts: ['NetIncomeLoss', 'ProfitLoss'] },
  {
    key: 'epsDiluted',
    label: 'Diluted EPS',
    concepts: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'],
    unit: 'USD/shares',
  },
  {
    key: 'dilutedShares',
    label: 'Diluted shares',
    concepts: [
      'WeightedAverageNumberOfDilutedSharesOutstanding',
      'WeightedAverageNumberOfShareOutstandingBasicAndDiluted',
    ],
    unit: 'shares',
  },
];

export const BALANCE_SHEET = [
  {
    key: 'cash',
    label: 'Cash & equivalents',
    concepts: [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    ],
  },
  { key: 'receivables', label: 'Receivables', concepts: ['AccountsReceivableNetCurrent'] },
  { key: 'inventory', label: 'Inventory', concepts: ['InventoryNet'] },
  { key: 'currentAssets', label: 'Current assets', concepts: ['AssetsCurrent'] },
  { key: 'assets', label: 'Total assets', concepts: ['Assets'] },
  { key: 'currentLiabilities', label: 'Current liabilities', concepts: ['LiabilitiesCurrent'] },
  {
    key: 'longTermDebt',
    label: 'Long-term debt',
    concepts: ['LongTermDebtNoncurrent', 'LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations'],
  },
  { key: 'liabilities', label: 'Total liabilities', concepts: ['Liabilities'] },
  {
    key: 'equity',
    label: 'Shareholders’ equity',
    concepts: [
      'StockholdersEquity',
      'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    ],
  },
  {
    key: 'goodwill',
    label: 'Goodwill',
    concepts: ['Goodwill'],
  },
];

export const CASH_FLOW = [
  {
    key: 'operatingCashFlow',
    label: 'Cash from operations',
    concepts: [
      'NetCashProvidedByUsedInOperatingActivities',
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ],
  },
  {
    key: 'capex',
    label: 'Capital expenditure',
    concepts: [
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'PaymentsToAcquireProductiveAssets',
    ],
  },
  {
    key: 'depreciation',
    label: 'D&A',
    concepts: [
      'DepreciationDepletionAndAmortization',
      'DepreciationAmortizationAndAccretionNet',
      'Depreciation',
    ],
  },
  {
    key: 'buybacks',
    label: 'Share repurchases',
    concepts: ['PaymentsForRepurchaseOfCommonStock'],
  },
  {
    key: 'dividends',
    label: 'Dividends paid',
    concepts: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'],
  },
  {
    key: 'stockComp',
    label: 'Stock-based comp',
    concepts: ['ShareBasedCompensation'],
  },
];

export const STATEMENTS = [
  { id: 'income', label: 'Income statement', lines: INCOME_STATEMENT },
  { id: 'balance', label: 'Balance sheet', lines: BALANCE_SHEET, instant: true },
  { id: 'cashflow', label: 'Cash flow', lines: CASH_FLOW },
];

function sub(a, b) {
  return a == null || b == null ? null : a - b;
}

/** Derived metrics computed from whatever the statements produced. */
export const DERIVED = [
  {
    key: 'grossMargin',
    label: 'Gross margin',
    percent: true,
    compute: (r) => ratio(r.grossProfit, r.revenue),
  },
  {
    key: 'operatingMargin',
    label: 'Operating margin',
    percent: true,
    compute: (r) => ratio(r.operatingIncome, r.revenue),
  },
  {
    key: 'netMargin',
    label: 'Net margin',
    percent: true,
    compute: (r) => ratio(r.netIncome, r.revenue),
  },
  {
    key: 'freeCashFlow',
    label: 'Free cash flow',
    compute: (r) =>
      r.operatingCashFlow == null ? null : r.operatingCashFlow - (r.capex || 0),
  },
  {
    key: 'fcfMargin',
    label: 'FCF margin',
    percent: true,
    compute: (r) => {
      const fcf = r.operatingCashFlow == null ? null : r.operatingCashFlow - (r.capex || 0);
      return ratio(fcf, r.revenue);
    },
  },
  {
    key: 'netDebt',
    label: 'Net debt',
    compute: (r) => (r.longTermDebt == null ? null : r.longTermDebt - (r.cash || 0)),
  },
  {
    key: 'returnOnEquity',
    label: 'Return on equity',
    percent: true,
    compute: (r) => ratio(r.netIncome, r.equity),
  },
  {
    key: 'currentRatio',
    label: 'Current ratio',
    compute: (r) => ratio(r.currentAssets, r.currentLiabilities),
  },
];

function ratio(a, b) {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}
