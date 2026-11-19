import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
// `||`, not `??`: a GitHub secret that is missing expands to an empty string, not undefined.
const configuredUrl = meta?.DATABASE_URL || process.env.DATABASE_URL;
const authToken = meta?.DATABASE_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;

// The local SQLite fallback is for development only. In CI it used to hide a missing secret:
// the build connected to an empty file and failed later with a confusing "no such table".
if (!configuredUrl && process.env.CI) {
  throw new Error(
    'DATABASE_URL is not set. In GitHub Actions, check the TURSO_DATABASE_URL and ' +
      'TURSO_AUTH_TOKEN repository secrets.'
  );
}

export const db = drizzle(
  createClient({ url: configuredUrl ?? 'file:./data/recalls.db', authToken })
);
