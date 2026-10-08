import { and, gte, inArray, lte, or, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { recalls, hazards, remedyOptions } from '../src/db/schema';
import type { RecallItem, RecallWindow } from '../src/lib/recalls';

// Takes the db as a parameter, like upsertRecall, so tests can use a throwaway database.

/**
 * Past this many removals in one run, assume something is wrong with the response (a
 * truncated page, a contract change) rather than a wave of genuine corrections, and leave
 * the rows alone. CPSC's own corrections have so far come a handful at a time.
 */
export const MAX_REMOVALS = 10;

export type RemovalResult =
  | { status: 'removed'; recallIds: number[] }
  | { status: 'skipped'; reason: string; recallIds: number[] };

/**
 * Deletes stored recalls whose RecallID no longer means what it meant when stored.
 *
 * RecallID is not a stable identity. CPSC has published one recall under two IDs, then
 * reused the spare ID for an unrelated recall a week later. When that new recall is not a
 * children's product the ingest skips it, so the upsert never overwrites the stale row and
 * the duplicate stays on the site. A stored row is stale when either:
 *
 * - **reassigned**: CPSC returns its ID with a different recall number — checked at any
 *   date, since the stale row keeps the old recall's date; or
 * - **withdrawn**: it is dated inside `dateWindow` and CPSC no longer returns its ID.
 *
 * `returned` must be every record in the response, before the child-product filter —
 * otherwise narrowing the keyword list would read as withdrawals. Run it after the
 * upserts, so a reassigned ID that is still a children's product has been overwritten
 * (and matches again) by the time this compares numbers.
 */
export async function removeStaleRecalls(
  db: LibSQLDatabase,
  dateWindow: RecallWindow,
  returned: Pick<RecallItem, 'RecallID' | 'RecallNumber'>[]
): Promise<RemovalResult> {
  const numberById = new Map(returned.map(r => [r.RecallID, r.RecallNumber]));

  // recall_date is stored as a full timestamp ("2026-09-10T00:00:00"), so compare on its
  // date part to match the API's day-granular window.
  const day = sql<string>`substr(${recalls.recallDate}, 1, 10)`;
  const inWindow = and(gte(day, dateWindow.start), lte(day, dateWindow.end));
  const stored = await db
    .select({ recallId: recalls.recallId, recallNumber: recalls.recallNumber })
    .from(recalls)
    .where(
      numberById.size ? or(inWindow, inArray(recalls.recallId, [...numberById.keys()])) : inWindow
    );

  const recallIds = stored
    .filter(row => {
      if (!numberById.has(row.recallId)) return true; // withdrawn (only in-window rows reach here)
      const current = numberById.get(row.recallId);
      return !!row.recallNumber && !!current && row.recallNumber !== current; // reassigned
    })
    .map(row => row.recallId);
  if (!recallIds.length) return { status: 'removed', recallIds };

  // An empty response for a window that has stored recalls is an outage, not a mass
  // withdrawal.
  if (!returned.length) {
    return { status: 'skipped', reason: 'CPSC returned no recalls for the window', recallIds };
  }
  if (recallIds.length > MAX_REMOVALS) {
    return {
      status: 'skipped',
      reason: `${recallIds.length} stale recalls exceeds the limit of ${MAX_REMOVALS}`,
      recallIds,
    };
  }

  // Children first, all in one transaction, so a failure cannot leave orphaned rows or a
  // recall stripped of its hazards.
  await db.batch([
    db.delete(hazards).where(inArray(hazards.recallId, recallIds)),
    db.delete(remedyOptions).where(inArray(remedyOptions.recallId, recallIds)),
    db.delete(recalls).where(inArray(recalls.recallId, recallIds)),
  ]);
  return { status: 'removed', recallIds };
}
