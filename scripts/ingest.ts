import 'dotenv/config';
import { db } from '../src/db/client';
import { buildApiUrl, isChildProduct, parseRecallResponse } from '../src/lib/recalls';
import { upsertRecall } from './upsert-recall';

// How far back to ask the CPSC API for. The default covers the daily schedule with a
// wide margin for late-published recalls; a one-off backfill overrides it with
// INGEST_DAYS. Re-running a wider window is safe — rows upsert on recallId.
// Scheduled Actions runs set this to the empty string rather than leaving it unset, so
// test for truthiness instead of nullishness.
const daysInput = process.env.INGEST_DAYS?.trim();
const DAYS = daysInput ? Number(daysInput) : 30;
if (!Number.isFinite(DAYS) || DAYS <= 0) {
  throw new Error(`INGEST_DAYS must be a positive number, got "${daysInput}"`);
}

async function main() {
  const res = await fetch(buildApiUrl(DAYS));
  if (!res.ok) throw new Error(`CPSC ${res.status}`);

  const items = parseRecallResponse(await res.json()).filter(isChildProduct);

  const now = new Date().toISOString();
  const counts = { inserted: 0, updated: 0 };

  // Each recall commits on its own, so a mid-run failure leaves earlier recalls fully
  // written and later ones untouched — never one half-written. The next run picks up
  // the rest, since it re-reads the whole window.
  for (const item of items) {
    counts[await upsertRecall(db, item, now)]++;
  }

  console.log(
    `Ingested ${items.length} child-product recalls from the last ${DAYS} days ` +
      `(${counts.inserted} new, ${counts.updated} updated).`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
