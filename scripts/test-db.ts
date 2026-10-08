import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';

// A throwaway file database per test — never DATABASE_URL, so this cannot reach Turso.
// A file rather than :memory: because libSQL may open a fresh connection for a batch,
// and a fresh :memory: connection is an empty database.
export async function createTestDb(): Promise<{ db: LibSQLDatabase; cleanup: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'recalls-test-'));
  const client = createClient({ url: `file:${join(dir, 'test.db')}` });
  // Mirrors src/db/schema.ts; only the columns and keys the scripts depend on matter.
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
  return {
    db: drizzle(client),
    cleanup: () => {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
