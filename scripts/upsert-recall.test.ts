import { eq, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hazards, recalls, remedyOptions } from '../src/db/schema';
import type { RecallItem } from '../src/lib/recalls';
import { createTestDb } from './test-db';
import { upsertRecall } from './upsert-recall';

let db: LibSQLDatabase;
let cleanup: () => void;

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
});

afterEach(() => cleanup());

const item: RecallItem = {
  RecallID: 1,
  Title: 'Acme Recalls Cribs',
  RecallDate: '2026-07-30T00:00:00',
  Hazards: [{ Name: 'Entrapment hazard' }],
  RemedyOptions: [{ Option: 'Refund' }],
  Images: [{ URL: 'https://example.com/crib.jpg', Caption: 'Recalled crib' }],
};

describe('upsertRecall', () => {
  it('inserts a new recall with its child rows', async () => {
    expect(await upsertRecall(db, item, 'run-1')).toBe('inserted');

    const [row] = await db.select().from(recalls);
    expect(row).toMatchObject({ title: 'Acme Recalls Cribs', imageCaption: 'Recalled crib' });
    expect(await db.select().from(hazards)).toEqual([
      { recallId: 1, name: 'Entrapment hazard', tag: 'entrapment' },
    ]);
    expect(await db.select().from(remedyOptions)).toEqual([{ recallId: 1, option: 'Refund' }]);
  });

  it('updates an existing recall, keeping firstSeen and replacing child rows', async () => {
    await upsertRecall(db, item, 'run-1');
    const changed = { ...item, Hazards: [{ Name: 'Fall hazard' }], RemedyOptions: [] };
    expect(await upsertRecall(db, changed, 'run-2')).toBe('updated');

    const [row] = await db.select().from(recalls);
    expect(row).toMatchObject({ firstSeen: 'run-1', lastSeen: 'run-2' });
    expect(await db.select().from(hazards)).toEqual([
      { recallId: 1, name: 'Fall hazard', tag: 'fall' },
    ]);
    expect(await db.select().from(remedyOptions)).toEqual([]);
  });

  it('rolls back every write when one fails', async () => {
    await upsertRecall(db, item, 'run-1');
    // Make the final statement of the batch fail.
    await db.run(sql`DROP TABLE remedy_options`);

    const changed = { ...item, Title: 'Changed', Hazards: [{ Name: 'Fall hazard' }] };
    await expect(upsertRecall(db, changed, 'run-2')).rejects.toThrow();

    const [row] = await db.select().from(recalls).where(eq(recalls.recallId, 1));
    expect(row).toMatchObject({ title: 'Acme Recalls Cribs', lastSeen: 'run-1' });
    expect(await db.select().from(hazards)).toEqual([
      { recallId: 1, name: 'Entrapment hazard', tag: 'entrapment' },
    ]);
  });
});
