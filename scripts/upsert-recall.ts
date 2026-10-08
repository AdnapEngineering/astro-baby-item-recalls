import type { BatchItem } from 'drizzle-orm/batch';
import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { recalls, hazards, remedyOptions } from '../src/db/schema';
import { hazardTag, type RecallItem } from '../src/lib/recalls';

// Takes the db as a parameter, rather than importing the shared client, so tests can
// point it at a throwaway local database instead of Turso.

/**
 * Upserts one recall and re-syncs its hazard and remedy-option rows.
 *
 * All of it goes in a single `db.batch`, which libSQL runs as one transaction in one round
 * trip. Run as separate statements, a failure between the delete and the re-insert would
 * leave the recall with no hazards, and it would drop off every hazard page until the next
 * ingest happened to touch it.
 */
export async function upsertRecall(
  db: LibSQLDatabase,
  item: RecallItem,
  now: string
): Promise<'inserted' | 'updated'> {
  // Everything except the identity and firstSeen — shared between the insert and the
  // update branch so the two can't drift apart. Each of these is 1-per-recall in the
  // API, so the [0] reads drop extras rather than crash if that ever changes.
  const fields = {
    recallNumber: item.RecallNumber ?? null,
    title: item.Title,
    description: item.Description ?? null,
    recallDate: item.RecallDate,
    lastPublishDate: item.LastPublishDate ?? null,
    url: item.URL ?? null,
    imageUrl: item.Images?.[0]?.URL ?? null,
    imageCaption: item.Images?.[0]?.Caption ?? null,
    consumerContact: item.ConsumerContact ?? null,
    remedy: item.Remedies?.[0]?.Name ?? null,
    injuries: item.Injuries?.[0]?.Name ?? null,
    unitsText: item.Products?.[0]?.NumberOfUnits ?? null,
    soldAt: item.Retailers?.[0]?.Name ?? null,
    country: item.ManufacturerCountries?.[0]?.Country ?? null,
  };

  // Upsert on RecallID. firstSeen is omitted from the update, so it keeps the original
  // run's timestamp — which is also how the caller learns whether the row is new.
  const upsert = db
    .insert(recalls)
    .values({ recallId: item.RecallID, ...fields, firstSeen: now, lastSeen: now })
    .onConflictDoUpdate({ target: recalls.recallId, set: { ...fields, lastSeen: now } })
    .returning({ firstSeen: recalls.firstSeen });

  // Re-sync this recall's child rows: clear then re-insert. These sets are tiny, so this
  // is simpler and correct versus diffing child rows.
  const childWrites: BatchItem<'sqlite'>[] = [
    db.delete(hazards).where(eq(hazards.recallId, item.RecallID)),
    db.delete(remedyOptions).where(eq(remedyOptions.recallId, item.RecallID)),
  ];
  const hazardRows = (item.Hazards ?? [])
    .filter(h => h.Name)
    .map(h => ({ recallId: item.RecallID, name: h.Name!, tag: hazardTag(h.Name!) }));
  if (hazardRows.length) childWrites.push(db.insert(hazards).values(hazardRows));
  const optionRows = (item.RemedyOptions ?? []).map(o => ({
    recallId: item.RecallID,
    option: o.Option,
  }));
  if (optionRows.length) childWrites.push(db.insert(remedyOptions).values(optionRows));

  const [upserted] = await db.batch([upsert, ...childWrites]);
  return upserted[0]?.firstSeen === now ? 'inserted' : 'updated';
}
