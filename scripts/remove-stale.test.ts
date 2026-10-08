import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hazards, recalls, remedyOptions } from '../src/db/schema';
import type { RecallItem } from '../src/lib/recalls';
import { MAX_REMOVALS, removeStaleRecalls } from './remove-stale';
import { createTestDb } from './test-db';
import { upsertRecall } from './upsert-recall';

let db: LibSQLDatabase;
let cleanup: () => void;

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
});

afterEach(() => cleanup());

const dateWindow = { start: '2026-09-01', end: '2026-09-30' };

function item(id: number, date = '2026-09-10T00:00:00', number = `N${id}`): RecallItem {
  return {
    RecallID: id,
    RecallNumber: number,
    Title: `Recall ${id}`,
    RecallDate: date,
    Hazards: [{ Name: 'Tip-over hazard' }],
    RemedyOptions: [{ Option: 'Refund' }],
  };
}

async function seed(...items: RecallItem[]) {
  for (const i of items) await upsertRecall(db, i, 'run-1');
}

const storedIds = async () =>
  (await db.select({ id: recalls.recallId }).from(recalls)).map(r => r.id).sort();

describe('removeStaleRecalls', () => {
  it('removes a recall CPSC stopped returning, with its child rows', async () => {
    await seed(item(1), item(2));

    expect(await removeStaleRecalls(db, dateWindow, [item(1)])).toEqual({
      status: 'removed',
      recallIds: [2],
    });
    expect(await storedIds()).toEqual([1]);
    expect((await db.select().from(hazards)).map(h => h.recallId)).toEqual([1]);
    expect((await db.select().from(remedyOptions)).map(o => o.recallId)).toEqual([1]);
  });

  it('leaves recalls dated outside the fetched window alone', async () => {
    await seed(item(1), item(2, '2026-08-15T00:00:00'), item(3, '2026-10-01T00:00:00'));

    await removeStaleRecalls(db, dateWindow, [item(1)]);
    expect(await storedIds()).toEqual([1, 2, 3]);
  });

  it('treats timestamps on the last day as inside the window', async () => {
    await seed(item(1), item(2, '2026-09-30T00:00:00'));

    await removeStaleRecalls(db, dateWindow, [item(1)]);
    expect(await storedIds()).toEqual([1]);
  });

  it('skips the cleanup when CPSC returned nothing', async () => {
    await seed(item(1));

    expect(await removeStaleRecalls(db, dateWindow, [])).toMatchObject({
      status: 'skipped',
      recallIds: [1],
    });
    expect(await storedIds()).toEqual([1]);
  });

  it(`skips the cleanup past ${MAX_REMOVALS} removals`, async () => {
    const many = Array.from({ length: MAX_REMOVALS + 1 }, (_, i) => item(i + 2));
    await seed(item(1), ...many);

    expect(await removeStaleRecalls(db, dateWindow, [item(1)])).toMatchObject({
      status: 'skipped',
    });
    expect(await storedIds()).toHaveLength(MAX_REMOVALS + 2);
  });

  it('removes a row whose ID CPSC reused for another recall, whatever its date', async () => {
    // Stored as a copy of N1, dated before the window; CPSC now uses ID 2 for N9.
    await seed(item(1), item(2, '2026-08-15T00:00:00', 'N1'));

    const result = await removeStaleRecalls(db, dateWindow, [
      item(1),
      item(2, '2026-09-17T00:00:00', 'N9'),
    ]);
    expect(result).toEqual({ status: 'removed', recallIds: [2] });
    expect(await storedIds()).toEqual([1]);
  });

  it('keeps a row whose recall number still matches', async () => {
    await seed(item(1), item(2, '2026-08-15T00:00:00'));

    await removeStaleRecalls(db, dateWindow, [item(1), item(2)]);
    expect(await storedIds()).toEqual([1, 2]);
  });
});
