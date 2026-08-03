import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { recalls, hazards } from '../src/db/schema';
import { buildApiUrl, isChildProduct, parseRecallResponse } from '../src/lib/recalls';

const DAYS = 90;

async function main() {
  const res = await fetch(buildApiUrl(DAYS));
  if (!res.ok) throw new Error(`CPSC ${res.status}`);

  const items = parseRecallResponse(await res.json()).filter(isChildProduct);

  const now = new Date().toISOString();

  for (const item of items) {
    //upsert on RecallId
    await db
      .insert(recalls)
      .values({
        recallId: item.RecallID,
        title: item.Title,
        description: item.Description ?? null,
        recallDate: item.RecallDate,
        url: item.URL ?? null,
        firstSeen: now,
        lastSeen: now,
      })
      .onConflictDoUpdate({
        target: recalls.recallId,
        set: {
          lastSeen: now,
          title: item.Title,
          description: item.Description ?? null,
          recallDate: item.RecallDate,
          url: item.URL ?? null,
        },
      });

    // Re-sync this recall's hazards: clear then re-insert. Hazard sets are tiny, so this is
    // simpler and correct versus diffing child rows.
    await db.delete(hazards).where(eq(hazards.recallId, item.RecallID));
    for (const h of item.Hazards ?? []) {
      if (h.Name) await db.insert(hazards).values({ recallId: item.RecallID, name: h.Name });
    }
  }

  console.log(`Ingested ${items.length} child-product recalls from the last ${DAYS} days.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
