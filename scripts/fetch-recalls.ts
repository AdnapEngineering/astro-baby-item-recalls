import {
  buildApiUrl,
  CpscUnavailableError,
  parseRecallResponse,
  splitWindow,
  type RecallItem,
  type RecallWindow,
} from '../src/lib/recalls';

/**
 * Longest date range requested at once. On 2026-10-08 the API failed every 30-day query
 * with its error record while 7-, 14- and 21-day queries all succeeded — its database
 * appears to time out on larger result sets. 7 leaves a wide margin.
 */
export const MAX_WINDOW_DAYS = 7;

type Options = {
  attempts?: number;
  /** Wait before the first retry; doubles after each failed attempt. */
  baseDelayMs?: number;
  // Injectable so tests run without the network or real waits.
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
};

/**
 * Fetches and validates one CPSC response, retrying while CPSC is failing on its side.
 *
 * The defaults wait 10, 20, 40 and 80 seconds between five attempts — about 2.5 minutes at
 * worst, which a scheduled job can afford. Only outages are retried: a schema mismatch or a
 * 4xx means the request or the contract is wrong, and repeating it changes nothing.
 */
export async function fetchRecallsWithRetry(
  url: string,
  {
    attempts = 5,
    baseDelayMs = 10_000,
    fetchImpl = fetch,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    log = console.warn,
  }: Options = {}
): Promise<RecallItem[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchOnce(url, fetchImpl);
    } catch (err) {
      if (!(err instanceof CpscUnavailableError)) throw err;
      if (attempt >= attempts) {
        throw new CpscUnavailableError(
          `CPSC unavailable after ${attempts} attempts: ${err.message}`
        );
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      log(`[ingest] attempt ${attempt} failed (${err.message}); retrying in ${delay / 1000}s`);
      await sleep(delay);
    }
  }
}

async function fetchOnce(url: string, fetchImpl: typeof fetch): Promise<RecallItem[]> {
  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch (err) {
    // fetch rejects only on network failure (DNS, reset, timeout), never on HTTP status.
    throw new CpscUnavailableError(`network error: ${(err as Error).message}`);
  }
  if (!res.ok) {
    const message = `HTTP ${res.status} ${res.statusText}`.trim();
    if (res.status >= 500 || res.status === 429) throw new CpscUnavailableError(message);
    throw new Error(`CPSC request failed: ${message}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    // A 200 with an HTML error page — the same outage, served by a different layer.
    throw new CpscUnavailableError('response was not JSON');
  }
  return parseRecallResponse(json);
}

/**
 * Fetches every recall in `dateWindow`, one chunk at a time, each with its own retries.
 *
 * All or nothing: if any chunk still fails after its retries, this throws rather than
 * returning a partial list — the stale-recall cleanup reads a missing recall as withdrawn.
 */
export async function fetchWindowWithRetry(
  dateWindow: RecallWindow,
  options: Options = {}
): Promise<RecallItem[]> {
  const byId = new Map<number, RecallItem>();
  for (const chunk of splitWindow(dateWindow, MAX_WINDOW_DAYS)) {
    for (const item of await fetchRecallsWithRetry(buildApiUrl(chunk), options)) {
      byId.set(item.RecallID, item); // chunks overlap by a day
    }
  }
  return [...byId.values()];
}
