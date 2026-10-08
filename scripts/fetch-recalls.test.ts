import { describe, expect, it, vi } from 'vitest';
import { CpscUnavailableError, RecallSchemaError } from '../src/lib/recalls';
import { fetchRecallsWithRetry, fetchWindowWithRetry } from './fetch-recalls';

const recall = { RecallID: 1, Title: 'Acme Recalls Cribs', RecallDate: '2026-09-10T00:00:00' };

// Copied from a live response, 2026-10-08.
const cpscError = [
  {
    RecallID: 0,
    RecallNumber: null,
    RecallDate: null,
    Description: null,
    URL: null,
    Title: 'Error retrieving Recalls: The underlying provider failed on Open.',
    Products: [],
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(...responses: (Response | Error)[]) {
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift()!;
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async () => {});
  const run = () =>
    fetchRecallsWithRetry('https://example.test', {
      attempts: 3,
      baseDelayMs: 10,
      fetchImpl: fetchImpl as typeof fetch,
      sleep,
      log: () => {},
    });
  return { fetchImpl, sleep, run };
}

describe('fetchRecallsWithRetry', () => {
  it('returns parsed recalls on the first good response', async () => {
    const { run, fetchImpl } = setup(json([recall]));
    expect(await run()).toEqual([recall]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries CPSC's error record, backing off, until a good response", async () => {
    const { run, sleep } = setup(json(cpscError), json(cpscError), json([recall]));
    expect(await run()).toEqual([recall]);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
  });

  it('treats server errors, network failures, and non-JSON bodies as outages', async () => {
    const { run, fetchImpl } = setup(
      new Response('down', { status: 503 }),
      new TypeError('fetch failed'),
      new Response('<html>oops</html>', { status: 200 }),
      json([recall])
    );
    await expect(run()).rejects.toThrow(CpscUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('gives up after the last attempt with an outage error', async () => {
    const { run } = setup(json(cpscError), json(cpscError), json(cpscError));
    await expect(run()).rejects.toThrow(/unavailable after 3 attempts: .*underlying provider/);
  });

  it('does not retry a schema mismatch', async () => {
    const { run, fetchImpl } = setup(json([{ RecallID: 'not-a-number' }]), json([recall]));
    await expect(run()).rejects.toThrow(RecallSchemaError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry a client error', async () => {
    const { run, fetchImpl } = setup(new Response('nope', { status: 404 }), json([recall]));
    await expect(run()).rejects.toThrow(/CPSC request failed: HTTP 404/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('fetchWindowWithRetry', () => {
  const options = (fetchImpl: unknown) => ({
    attempts: 2,
    baseDelayMs: 1,
    fetchImpl: fetchImpl as typeof fetch,
    sleep: async () => {},
    log: () => {},
  });
  const window = { start: '2026-09-08', end: '2026-09-20' }; // two 7-day chunks

  it('requests each chunk and merges the results, deduplicating the overlap day', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('RecallDateStart=2026-09-08')
        ? json([recall, { ...recall, RecallID: 2 }])
        : json([
            { ...recall, RecallID: 2 },
            { ...recall, RecallID: 3 },
          ])
    );
    const items = await fetchWindowWithRetry(window, options(fetchImpl));

    expect(
      fetchImpl.mock.calls.map(([url]) =>
        url.match(/Start=([\d-]+)&RecallDateEnd=([\d-]+)/)!.slice(1)
      )
    ).toEqual([
      ['2026-09-08', '2026-09-14'],
      ['2026-09-14', '2026-09-20'],
    ]);
    expect(items.map(i => i.RecallID)).toEqual([1, 2, 3]);
  });

  it('fails the whole window if one chunk never succeeds', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('RecallDateStart=2026-09-08') ? json([recall]) : json(cpscError)
    );
    await expect(fetchWindowWithRetry(window, options(fetchImpl))).rejects.toThrow(
      CpscUnavailableError
    );
  });
});
