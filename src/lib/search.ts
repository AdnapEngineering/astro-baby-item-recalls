import { toRecallSummary, type RecallDetail, type RecallSummary } from './recall-details';

/** A list row plus the lowercased text it can be found by. */
export type SearchEntry = RecallSummary & { haystack: string };

export function toSearchEntry(detail: RecallDetail): SearchEntry {
  // Product names are not stored, but CPSC titles and descriptions name the product and
  // brand. Every entry ships to the browser inside the page, so the long prose fields are
  // left out: hazard paragraphs are represented by their labels, and contact text's
  // boilerplate ("call", "email", "online") would match almost any short query anyway.
  const haystack = [
    detail.title,
    detail.description,
    detail.soldAt,
    detail.recallNumber,
    ...detail.hazardTags.map(tag => tag.label),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  // The remedy paragraph is the single largest field; the list shows the remedy options
  // and the detail page carries the full text.
  return { ...toRecallSummary(detail), remedy: null, haystack };
}

/**
 * Entries containing every whitespace-separated term of the query (in any order), and
 * carrying the given hazard tag when one is set. An empty query matches everything.
 */
export function filterRecalls(
  entries: SearchEntry[],
  query: string,
  hazard: string | null = null
): SearchEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(
    entry =>
      (!hazard || entry.hazardTags.some(tag => tag.slug === hazard)) &&
      terms.every(term => entry.haystack.includes(term))
  );
}
