import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hazards, recalls, remedyOptions } from '../src/db/schema';
import type { RecallItem } from '../src/lib/recalls';
import { upsertRecall } from './upsert-recall';

// A throwaway file database per test — never DATABASE_URL, so this cannot reach Turso.
// A file rather than :memory: because libSQL may open a fresh connection for a batch,
// and a fresh :memory: connection is an empty database.
let dir: string;
let client: Client;
let db: LibSQLDatabase;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'upsert-recall-'));
  client = createClient({ url: `file:${join(dir, 'test.db')}` });
  db = drizzle(client);
  // Mirrors src/db/schema.ts; only the columns and keys the upsert depends on matter.
  await client.executeMultiple(`
    CREATE TABLE recalls (
      recall_id INTEGER PRIMARY KEY, recall_number TEXT, title TEXT NOT NULL,
      description TEXT, recall_date TEXT NOT NULL, last_publish_date TEXT, url TEXT,
      image_url TEXT, image_caption TEXT, consumer_contact TEXT, remedy TEXT, injuries TEXT,
      units_text TEXT, sold_at TEXT, country TEXT,
      first_seen TEXT NOT NULL, last_seen TEXT NOT NULL
    );
    CREATE TABLE hazards (recall_id INTEGER NOT NULL, name TEXT NOT NULL, tag TEXT);
    CREATE TABLE remedy_options (recall_id INTEGER NOT NULL, option TEXT NOT NULL);
  `);
});

afterEach(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

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
    await client.execute('DROP TABLE remedy_options');

    const changed = { ...item, Title: 'Changed', Hazards: [{ Name: 'Fall hazard' }] };
    await expect(upsertRecall(db, changed, 'run-2')).rejects.toThrow();

    const [row] = await db.select().from(recalls).where(eq(recalls.recallId, 1));
    expect(row).toMatchObject({ title: 'Acme Recalls Cribs', lastSeen: 'run-1' });
    expect(await db.select().from(hazards)).toEqual([
      { recallId: 1, name: 'Entrapment hazard', tag: 'entrapment' },
    ]);
  });
});
