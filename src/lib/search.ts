import { toRecallSummary, type RecallDetail, type RecallSummary } from './recall-details';

/** A list row plus the lowercased text it can be found by. */
export type SearchEntry = RecallSummary & { haystack: string };

export const REMEDIES = ['Refund', 'Repair', 'Replace'] as const;

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

const searchCache = new WeakMap<SearchEntry, { text: string; compact: string; words: string[] }>();

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
}

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length || i === b.length) return true;
  if (
    a.length === b.length &&
    a[i] === b[i + 1] &&
    a[i + 1] === b[i] &&
    a.slice(i + 2) === b.slice(i + 2)
  )
    return true;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Matches all query terms in any order, with optional hazard, product type, and remedy filters. */
export function filterRecalls(
  entries: SearchEntry[],
  query: string,
  hazard: string | null = null,
  type: string | null = null,
  remedy: string | null = null
): SearchEntry[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return entries.filter(entry => {
    if (
      (hazard && !entry.hazardTags.some(tag => tag.slug === hazard)) ||
      (type && !entry.productTypes.some(t => t.slug === type)) ||
      (remedy && !entry.remedyOptions.includes(remedy))
    )
      return false;
    if (!terms.length) return true;
    let indexed = searchCache.get(entry);
    if (!indexed) {
      const text = normalize(entry.haystack);
      indexed = { text, compact: text.replace(/\s+/g, ''), words: text.split(/\s+/) };
      searchCache.set(entry, indexed);
    }
    return terms.every(
      term =>
        indexed.text.includes(term) ||
        (term.length >= 4 && indexed.compact.includes(term)) ||
        (term.length >= 5 &&
          /^[a-z]+$/.test(term) &&
          indexed.words.some(word => /^[a-z]+$/.test(word) && withinOneEdit(term, word)))
    );
  });
}
