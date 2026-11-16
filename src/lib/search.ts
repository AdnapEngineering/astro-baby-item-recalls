import { toRecallSummary, type RecallDetail, type RecallSummary } from './recall-details';

/** A list row plus the lowercased text it can be found by. */
export type SearchEntry = RecallSummary & { haystack: string };

export function toSearchEntry(detail: RecallDetail): SearchEntry {
  // Every entry ships to the browser inside the page, so the long prose fields are
  // left out: hazard paragraphs are represented by their labels, and contact text's
  // boilerplate ("call", "email", "online") would match almost any short query anyway.
  // Company names are in: a brand is often named only as the importer, not in the title.
  const haystack = [
    detail.title,
    detail.description,
    ...detail.productIdentifiers.flatMap(product => [product.name, product.model]),
    detail.soldAt,
    ...detail.companyNames,
    detail.recallNumber,
    ...detail.hazardTags.map(tag => tag.label),
    ...detail.productTypes.map(type => type.label),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  // The remedy paragraph is the single largest field; the list shows the remedy options
  // and the detail page carries the full text.
  return { ...toRecallSummary(detail), remedy: null, haystack };
}

/**
 * Entries containing every whitespace-separated term of the query (in any order), carrying
 * the given hazard tag and product type when those are set. An empty query matches everything.
 */
export function filterRecalls(
  entries: SearchEntry[],
  query: string,
  hazard: string | null = null,
  type: string | null = null
): SearchEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(
    entry =>
      (!hazard || entry.hazardTags.some(tag => tag.slug === hazard)) &&
      (!type || entry.productTypes.some(t => t.slug === type)) &&
      terms.every(term => entry.haystack.includes(term))
  );
}
