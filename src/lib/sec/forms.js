// Pure data, safe to import from client components. Kept out of filings.js
// because that module imports the SEC client, which imports `fs`.

/** Form types worth offering as filters, grouped for the UI. */
export const FORM_GROUPS = [
  {
    label: 'Periodic reports',
    forms: ['10-K', '10-Q', '20-F', '40-F', '11-K'],
  },
  {
    label: 'Events & proxies',
    forms: ['8-K', '6-K', 'DEF 14A', 'DEFA14A', 'PRE 14A'],
  },
  {
    label: 'Ownership & activism',
    forms: ['SC 13D', 'SC 13G', 'SC TO-T', '4', '3', '5', '13F-HR'],
  },
  {
    label: 'Offerings & registration',
    forms: ['S-1', 'S-3', 'S-4', '424B3', '424B4', 'F-1', '10-12B'],
  },
];

export const ALL_FORMS = FORM_GROUPS.flatMap((g) => g.forms);

/**
 * 8-K item codes. These are the actual catalyst taxonomy — far more precise
 * than keyword-matching a headline, because the filer is legally required to
 * classify the event themselves.
 */
export const ITEM_LABELS = {
  '1.01': 'Entry into a material agreement',
  '1.02': 'Termination of a material agreement',
  '1.03': 'Bankruptcy or receivership',
  '2.01': 'Completion of acquisition or disposition',
  '2.02': 'Results of operations',
  '2.03': 'Creation of a direct financial obligation',
  '2.04': 'Triggering events accelerating an obligation',
  '2.05': 'Costs associated with exit or disposal',
  '2.06': 'Material impairments',
  '3.01': 'Delisting or failure to satisfy a listing rule',
  '3.02': 'Unregistered sale of equity securities',
  '3.03': 'Modification to rights of security holders',
  '4.01': 'Changes in registrant’s certifying accountant',
  '4.02': 'Non-reliance on previously issued financials',
  '5.01': 'Changes in control of registrant',
  '5.02': 'Departure or election of directors and officers',
  '5.03': 'Amendments to articles or bylaws',
  '5.07': 'Submission of matters to a vote',
  '7.01': 'Regulation FD disclosure',
  '8.01': 'Other events',
  '9.01': 'Financial statements and exhibits',
};
