import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../src/db/schema';

// The CREATE statements for src/db/schema.ts, diffed from an empty database by drizzle-kit —
// so the test database cannot drift from the schema the way a hand-copied one would.
// Generated once per process; every test database replays the same statements.
let schemaSql: Promise<string[]> | undefined;
function createStatements(): Promise<string[]> {
  schemaSql ??= Promise.all([
    generateSQLiteDrizzleJson({}),
    generateSQLiteDrizzleJson(schema),
  ]).then(([empty, current]) => generateSQLiteMigration(empty, current));
  return schemaSql;
}

// A throwaway file database per test — never DATABASE_URL, so this cannot reach Turso.
// A file rather than :memory: because libSQL may open a fresh connection for a batch,
// and a fresh :memory: connection is an empty database.
export async function createTestDb(): Promise<{ db: LibSQLDatabase; cleanup: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'recalls-test-'));
  const client = createClient({ url: `file:${join(dir, 'test.db')}` });
  await client.executeMultiple((await createStatements()).join('\n'));
  return {
    db: drizzle(client),
    cleanup: () => {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
