import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const url = meta?.DATABASE_URL ?? process.env.DATABASE_URL ?? 'file:./data/recalls.db';
const authToken =  meta?.DATABASE_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN

export const db = drizzle(createClient({url, authToken}));