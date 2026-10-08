import { eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/client';
import { recalls, hazards } from '../db/schema';
import { groupByHazard, type HazardGroup } from './hazard-groups';

export type { HazardGroup } from './hazard-groups';

/** Recalls in one group past which the detail page stops being comfortably browsable. */
const PAGINATE_THRESHOLD = 100;

/**
 * Loads the hazards→recalls join and reshapes it into one group per hazard tag.
 *
 * Runs at build time only: `getStaticPaths` turns each group into a static route, so the
 * deployed site never touches the database.
 */
export async function getHazardGroups(): Promise<HazardGroup[]> {
  const rows = await db
    .select({
      tag: hazards.tag,
      recallId: recalls.recallId,
      title: recalls.title,
      url: recalls.url,
      recallDate: recalls.recallDate,
    })
    .from(hazards)
    // Inner, not left: a hazard whose recall is missing is a broken foreign key, and a
    // card with no title is worse than no card.
    .innerJoin(recalls, eq(hazards.recallId, recalls.recallId))
    // hazardTag() returns null for paragraphs matching none of its patterns. Those rows
    // have no slug and no heading, so there is no page they could belong to.
    .where(isNotNull(hazards.tag));

  // The isNotNull filter above guarantees a tag, but Drizzle's inferred type can't see it.
  const groups = groupByHazard(rows.map(row => ({ ...row, tag: row.tag! })));

  // Ingest appends indefinitely, so groups only grow. Long before the page weight matters,
  // an unbroken list stops being browsable — that is the point to reach for Astro's
  // paginate() in getStaticPaths. Warn in the build log rather than rely on anyone
  // remembering to check.
  for (const group of groups) {
    if (group.recalls.length > PAGINATE_THRESHOLD) {
      console.warn(
        `[hazards] ${group.slug} has ${group.recalls.length} recalls — consider paginating`
      );
    }
  }
  return groups;
}
