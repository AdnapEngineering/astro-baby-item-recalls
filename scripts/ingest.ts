import 'dotenv/config';
import { db } from '../src/db/client';
import { buildApiUrl, isChildProduct, parseRecallResponse, recallWindow } from '../src/lib/recalls';
import { removeStaleRecalls } from './remove-stale';
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
  const dateWindow = recallWindow(DAYS);
  const res = await fetch(buildApiUrl(dateWindow));
  if (!res.ok) throw new Error(`CPSC ${res.status}`);

  const all = parseRecallResponse(await res.json());
  const items = all.filter(isChildProduct);

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

  // After the upserts: a reassigned ID that is still a children's product has just been
  // overwritten, so only rows CPSC has truly moved on from are left to remove.
  const removal = await removeStaleRecalls(db, dateWindow, all);
  if (removal.status === 'skipped') {
    // A workflow annotation, so the skip shows on the run page instead of passing silently.
    console.log(
      `::warning::Stale-recall cleanup skipped: ${removal.reason}. ` +
        `Candidates: ${removal.recallIds.join(', ')}`
    );
  } else if (removal.recallIds.length) {
    console.log(
      `Removed ${removal.recallIds.length} stale recalls (withdrawn or ID reused by CPSC): ` +
        removal.recallIds.join(', ')
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
