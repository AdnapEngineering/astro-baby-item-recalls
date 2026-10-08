import { db } from '../db/client';
import { hazards, recalls, remedyOptions } from '../db/schema';
import { assembleRecallDetails, type RecallDetail } from './recall-details';

let cached: Promise<RecallDetail[]> | undefined;

/**
 * Every stored recall with its hazards and remedy options, newest first.
 *
 * Build time only. Several pages need the full set (the detail routes, the search page,
 * the home page), so the result is memoised per build rather than re-queried per page.
 */
export function getRecallDetails(): Promise<RecallDetail[]> {
  cached ??= Promise.all([
    db.select().from(recalls),
    db.select().from(hazards),
    db.select().from(remedyOptions),
  ]).then(([recallRows, hazardRows, optionRows]) =>
    assembleRecallDetails(recallRows, hazardRows, optionRows)
  );
  return cached;
}
