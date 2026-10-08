import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { filterRecalls, type SearchEntry } from '../lib/search';
import RecallListItem from './RecallListItem';

interface Props {
  entries: SearchEntry[];
  hazards: { slug: string; label: string }[];
}

// Filters build-time data entirely in the browser — no API or DB calls — so search works
// on the static host and stays instant. Without JavaScript the full list still renders.
export default function RecallSearch({ entries, hazards }: Props) {
  const [query, setQuery] = useState('');
  const [hazard, setHazard] = useState('');

  // ?q= and ?hazard= let a search be bookmarked or shared, and let the home page's search
  // box hand off to this page. Read after hydration rather than in useState's initializer:
  // the server render had no URL, and differing initial state would break hydration.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') ?? '');
    const fromUrl = params.get('hazard');
    if (fromUrl && hazards.some(h => h.slug === fromUrl)) setHazard(fromUrl);
  }, []);

  // replaceState, not pushState: an entry per keystroke would make Back unusable.
  function update(nextQuery: string, nextHazard: string) {
    setQuery(nextQuery);
    setHazard(nextHazard);
    const url = new URL(window.location.href);
    for (const [key, value] of [
      ['q', nextQuery.trim()],
      ['hazard', nextHazard],
    ]) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    history.replaceState(null, '', url);
  }

  // Keeps typing responsive: the list re-renders at lower priority than the input.
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(
    () => filterRecalls(entries, deferredQuery, hazard || null),
    [entries, deferredQuery, hazard]
  );
  const filtered = query.trim() !== '' || hazard !== '';

  return (
    <div>
      <form
        role="search"
        className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={e => e.preventDefault()}
      >
        <label className="flex-1">
          <span className="mb-1 block font-medium">Search by product, brand, or store</span>
          <input
            type="search"
            className="input w-full"
            placeholder="e.g. crib, stroller, Walmart"
            value={query}
            onChange={e => update(e.target.value, hazard)}
          />
        </label>
        <label>
          <span className="mb-1 block font-medium">Hazard</span>
          <select
            className="select w-full sm:w-auto"
            value={hazard}
            onChange={e => update(query, e.target.value)}
          >
            <option value="">All hazards</option>
            {hazards.map(h => (
              <option key={h.slug} value={h.slug}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
      </form>

      <p className="mb-4 text-sm text-base-content/70" aria-live="polite">
        {filtered
          ? `${results.length} of ${entries.length} recalls match.`
          : `${entries.length} recalls, newest first.`}
      </p>

      {results.length === 0 ? (
        <div className="alert">
          <span>
            No stored recalls match. Try fewer or different words — and remember this list only
            covers children's products the site has collected, so also check{' '}
            <a
              href="https://www.cpsc.gov/Recalls"
              target="_blank"
              rel="noopener noreferrer"
              className="link link-primary"
            >
              cpsc.gov<span className="sr-only"> (opens in a new tab)</span>
            </a>
            .
          </span>
        </div>
      ) : (
        <ul className="space-y-3">
          {results.map(recall => (
            <RecallListItem key={recall.recallId} recall={recall} />
          ))}
        </ul>
      )}
    </div>
  );
}
