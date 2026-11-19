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

/** How many products a list row names before summarising the rest as "+N more". */
export const LIST_PRODUCT_LIMIT = 3;

/**
 * The product line of a list row: the first few products as "Name · Model X", joined with
 * semicolons, plus how many were left out. Some recalls cover dozens of models, which made
 * one row fill a phone screen; the detail page lists them all.
 */
export function summarizeProducts(
  products: { name: string | null; model: string | null }[],
  limit = LIST_PRODUCT_LIMIT
): { text: string; more: number } {
  const labels = products
    .map(product =>
      [product.name, product.model && `Model ${product.model}`].filter(Boolean).join(' · ')
    )
    .filter(Boolean);
  return { text: labels.slice(0, limit).join('; '), more: Math.max(0, labels.length - limit) };
}
