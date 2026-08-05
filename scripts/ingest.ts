import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { recalls, hazards, remedyOptions } from '../src/db/schema';
import { buildApiUrl, hazardTag, isChildProduct, parseRecallResponse } from '../src/lib/recalls';

const DAYS = 100;

async function main() {
  const res = await fetch(buildApiUrl(DAYS));
  if (!res.ok) throw new Error(`CPSC ${res.status}`);

  const items = parseRecallResponse(await res.json()).filter(isChildProduct);

  const now = new Date().toISOString();

  for (const item of items) {
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

    //upsert on RecallId
    await db
      .insert(recalls)
      .values({ recallId: item.RecallID, ...fields, firstSeen: now, lastSeen: now })
      .onConflictDoUpdate({
        target: recalls.recallId,
        set: { ...fields, lastSeen: now }, // firstSeen omitted: it keeps the original run's timestamp
      });

    // Re-sync this recall's child rows: clear then re-insert. These sets are tiny, so this
    // is simpler and correct versus diffing child rows.
    await db.delete(hazards).where(eq(hazards.recallId, item.RecallID));
    const hazardRows = (item.Hazards ?? [])
      .filter(h => h.Name)
      .map(h => ({ recallId: item.RecallID, name: h.Name!, tag: hazardTag(h.Name!) }));
    if (hazardRows.length) await db.insert(hazards).values(hazardRows);

    await db.delete(remedyOptions).where(eq(remedyOptions.recallId, item.RecallID));
    const optionRows = (item.RemedyOptions ?? []).map(o => ({
      recallId: item.RecallID,
      option: o.Option,
    }));
    if (optionRows.length) await db.insert(remedyOptions).values(optionRows);
  }

  console.log(`Ingested ${items.length} child-product recalls from the last ${DAYS} days.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
