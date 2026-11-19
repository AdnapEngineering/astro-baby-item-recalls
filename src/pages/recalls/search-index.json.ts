import type { APIRoute } from 'astro';
import { getRecallDetails } from '../../lib/recall-data';
import { toSearchEntry } from '../../lib/search';

// Built to a static file, /recalls/search-index.json, that the search island fetches after
// the page loads. A separate file can be cached across visits, which inline props cannot.
export const GET: APIRoute = async () =>
  new Response(JSON.stringify((await getRecallDetails()).map(toSearchEntry)), {
    headers: { 'Content-Type': 'application/json' },
  });
