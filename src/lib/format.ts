// CPSC returns dates as full timestamps ("2026-07-30T00:00:00"), which is what the DB
// stores and what sorting relies on — so formatting happens here at render, not at ingest.
// The locale is pinned rather than left to the host: this runs on a GitHub Actions runner,
// and an unpinned locale would let the build machine decide the date format.
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

/** Renders a stored recall timestamp as e.g. "Jul 30, 2026". */
export function formatRecallDate(value: string) {
  const date = new Date(value);
  // Guard against a malformed timestamp rendering as "Invalid Date" on the page.
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}
