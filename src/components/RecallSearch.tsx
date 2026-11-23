import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { RecallSummary } from '../lib/recall-details';
import { filterRecalls, REMEDIES, type SearchEntry } from '../lib/search';
import RecallListItem from './RecallListItem';

interface Props {
  /** The newest recalls, rendered on the server so the page has content before any fetch. */
  initial: RecallSummary[];
  /** How many recalls the full index holds. */
  total: number;
  /** Rows shown at first, and added by each "Show more". */
  pageSize: number;
  /** URL of the static JSON search index (every recall, with its search text). */
  indexUrl: string;
  hazards: { slug: string; label: string }[];
  types: { slug: string; label: string }[];
}

type Filters = { query: string; hazard: string; type: string; remedy: string };

// Filters build-time data entirely in the browser — no API or DB calls — so search works
// on the static host and stays instant. The page carries only the first rows; the full index
// is a separate static JSON file, fetched once and cached by the browser, so it is neither
// inlined twice (rows plus island props) nor rendered in full before anyone searches.
export default function RecallSearch({
  initial,
  total,
  pageSize,
  indexUrl,
  hazards,
  types,
}: Props) {
  const [query, setQuery] = useState('');
  const [hazard, setHazard] = useState('');
  const [type, setType] = useState('');
  const [remedy, setRemedy] = useState('');
  const [ready, setReady] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [visible, setVisible] = useState(pageSize);
  const list = useRef<HTMLUListElement>(null);
  const focusRow = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(indexUrl)
      .then(response => {
        if (!response.ok) throw new Error(`Search index returned ${response.status}`);
        return response.json() as Promise<SearchEntry[]>;
      })
      .then(data => !cancelled && setEntries(data))
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [indexUrl]);

  // "Show more" can disappear once everything is shown, so focus moves to the first new row.
  useEffect(() => {
    if (focusRow.current === null) return;
    list.current?.children[focusRow.current]?.querySelector('a')?.focus();
    focusRow.current = null;
  }, [visible]);

  // URL parameters let a search be bookmarked or shared, and let the home page's search
  // box hand off to this page. Read after hydration rather than in useState's initializer:
  // the server render had no URL, and differing initial state would break hydration.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') ?? '');
    const fromUrl = params.get('hazard');
    if (fromUrl && hazards.some(h => h.slug === fromUrl)) setHazard(fromUrl);
    const typeFromUrl = params.get('type');
    if (typeFromUrl && types.some(t => t.slug === typeFromUrl)) setType(typeFromUrl);
    const remedyFromUrl = params.get('remedy');
    const matchingRemedy = REMEDIES.find(r => r.toLowerCase() === remedyFromUrl);
    if (matchingRemedy) setRemedy(matchingRemedy);
    setReady(true);
  }, []);

  // replaceState, not pushState: an entry per keystroke would make Back unusable.
  // Takes only the filters that changed; the rest keep their current value.
  function update(changes: Partial<Filters>) {
    const next = { query, hazard, type, remedy, ...changes };
    setVisible(pageSize);
    setQuery(next.query);
    setHazard(next.hazard);
    setType(next.type);
    setRemedy(next.remedy);
    const url = new URL(window.location.href);
    for (const [key, value] of [
      ['q', next.query.trim()],
      ['hazard', next.hazard],
      ['type', next.type],
      ['remedy', next.remedy.toLowerCase()],
    ]) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    history.replaceState(null, '', url);
  }

  // Keeps typing responsive: the list re-renders at lower priority than the input.
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(
    () =>
      entries &&
      filterRecalls(entries, deferredQuery, hazard || null, type || null, remedy || null),
    [entries, deferredQuery, hazard, type, remedy]
  );
  const filtered = deferredQuery.trim() !== '' || hazard !== '' || type !== '' || remedy !== '';
  // Until the index arrives, an unfiltered view shows the server-rendered rows; a filtered
  // one has nothing to show yet.
  const waiting = results === null && filtered && !loadFailed;
  const shown = results ? results.slice(0, visible) : filtered && !loadFailed ? [] : initial;
  const remaining = results ? results.length - shown.length : 0;

  function showMore() {
    focusRow.current = visible;
    setVisible(v => v + pageSize);
  }

  let status: string;
  if (results && filtered) status = `${results.length} of ${total} recalls match.`;
  else if (waiting) status = 'Loading recalls…';
  else status = `${total} recalls, newest first.`;

  // One chip per active filter, so a filter that arrived in a shared link is visible
  // and removable without hunting through the form.
  const chips: { key: keyof Filters; label: string }[] = [];
  if (query.trim()) chips.push({ key: 'query', label: `“${query.trim()}”` });
  const typeLabel = types.find(t => t.slug === type)?.label;
  if (typeLabel) chips.push({ key: 'type', label: `Product: ${typeLabel}` });
  const hazardLabel = hazards.find(h => h.slug === hazard)?.label;
  if (hazardLabel) chips.push({ key: 'hazard', label: `Hazard: ${hazardLabel}` });
  if (remedy) chips.push({ key: 'remedy', label: `Remedy: ${remedy}` });

  // The button that was pressed disappears with its filter, so focus moves to the search box
  // rather than falling back to the page body.
  function clear(changes: Partial<Filters>) {
    update(changes);
    searchInput.current?.focus();
  }
  const clearAll = () => clear({ query: '', hazard: '', type: '', remedy: '' });

  return (
    <div>
      <form
        role="search"
        hidden={!ready}
        className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        aria-label="Filter recalls"
        aria-describedby="search-help"
        onSubmit={e => e.preventDefault()}
      >
        <label className="min-w-0 flex-1">
          <span className="mb-1 block font-medium">Search by product, brand, or store</span>
          <input
            ref={searchInput}
            type="search"
            aria-controls="recall-results"
            className="input w-full"
            placeholder="e.g. crib, stroller, Walmart"
            value={query}
            onChange={e => update({ query: e.target.value })}
          />
        </label>
        <label>
          <span className="mb-1 block font-medium">Product type</span>
          <select
            aria-controls="recall-results"
            className="select w-full sm:w-auto"
            value={type}
            onChange={e => update({ type: e.target.value })}
          >
            <option value="">All products</option>
            {types.map(t => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block font-medium">Hazard</span>
          <select
            aria-controls="recall-results"
            className="select w-full sm:w-auto"
            value={hazard}
            onChange={e => update({ hazard: e.target.value })}
          >
            <option value="">All hazards</option>
            {hazards.map(h => (
              <option key={h.slug} value={h.slug}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block font-medium">Remedy</span>
          <select
            aria-controls="recall-results"
            className="select w-full sm:w-auto"
            value={remedy}
            onChange={e => update({ remedy: e.target.value })}
          >
            <option value="">All remedies</option>
            {REMEDIES.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </form>

      {ready && chips.length > 0 && (
        <div
          className="mb-3 flex flex-wrap items-center gap-2"
          aria-label="Active filters"
          role="group"
        >
          {chips.map(chip => (
            <button
              key={chip.key}
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => clear({ [chip.key]: '' })}
            >
              <span className="sr-only">Remove filter </span>
              {chip.label}
              <span aria-hidden="true"> ×</span>
            </button>
          ))}
          {chips.length > 1 && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={clearAll}>
              Clear all filters
            </button>
          )}
        </div>
      )}

      <p id="search-help" hidden={!ready} className="mb-3 text-sm">
        Results update as you type or choose a filter.
      </p>
      <noscript>
        <p className="mb-4">
          Filtering requires JavaScript.{' '}
          {total > initial.length
            ? `The newest ${initial.length} of ${total} recalls are listed below; browse by product or hazard to see the rest.`
            : "All collected recalls are listed below; use your browser's Find command to search this page."}
        </p>
      </noscript>

      {loadFailed && (
        <div className="alert alert-warning mb-4" role="alert">
          <span>
            Search is unavailable because the recall list could not be loaded. Reload the page to
            try again, or browse recalls by product or hazard.
          </span>
        </div>
      )}

      <p className="mb-4 text-sm text-base-content/70" role="status" aria-atomic="true">
        {status}
      </p>

      <div id="recall-results" aria-busy={query !== deferredQuery || waiting}>
        {waiting ? null : shown.length === 0 ? (
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
            {filtered && (
              <button type="button" className="btn btn-sm" onClick={clearAll}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <ul className="space-y-3" ref={list}>
              {shown.map(recall => (
                <RecallListItem key={recall.recallId} recall={recall} />
              ))}
            </ul>
            {remaining > 0 && (
              <p className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <button type="button" className="btn" onClick={showMore}>
                  Show {Math.min(pageSize, remaining)} more
                </button>
                <span className="text-sm text-base-content/70">{remaining} not shown</span>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
