// Client-safe constants. Kept out of theses.js because that module imports `fs`
// and so can never be pulled into a client component.

export const FALSIFIER_STATUS = {
  PENDING: 'pending',
  TRIGGERED: 'triggered',
  SURVIVED: 'survived',
};

/** What you did once a falsifier fired. The whole point of the journal. */
export const ACTION_LABELS = {
  exited: 'Exited the position',
  trimmed: 'Trimmed the position',
  held: 'Held anyway',
  added: 'Added to the position',
};
