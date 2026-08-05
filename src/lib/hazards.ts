import { eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/client';
import { recalls, hazards } from '../db/schema';

// hazardTag() already emits lowercase, hyphenated values, so the tag doubles as the URL
// slug and no slugify step is needed. What is needed is the inverse: the `name` column
// holds CPSC's full hazard paragraph, which is unusable as a heading. Keys must stay in
// sync with HAZARD_TAGS in recalls.ts — an unmapped tag falls back to the raw slug.
const HAZARD_LABELS: Record<string, string> = {
  battery: 'Button battery ingestion',
  suffocation: 'Suffocation',
  'tip-over': 'Tip-over',
  entrapment: 'Entrapment',
  choking: 'Choking',
  fall: 'Fall or collapse',
  fire: 'Fire, burn, or shock',
  drowning: 'Drowning',
};

// CPSC returns dates as full timestamps ("2026-07-30T00:00:00"), which is what the DB
// stores and what sorting relies on — so formatting happens here at render, not at ingest.
// The locale is pinned rather than left to the host: this runs on a GitHub Actions runner,
// and an unpinned locale would let the build machine decide the date format.
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

/** Renders a stored recall timestamp as e.g. "Jul 30, 2026". */
export function formatRecallDate(value: string) {
  const date = new Date(value);
  // Guard against a malformed timestamp rendering as "Invalid Date" on the page.
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

/** Recalls in one group past which the detail page stops being comfortably browsable. */
const PAGINATE_THRESHOLD = 100;

export type HazardGroup = {
  slug: string;
  name: string;
  recalls: { recallId: number; title: string; url: string | null; recallDate: string }[];
};

/**
 * Reshapes the flat hazards→recalls join into one group per hazard tag, largest first.
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

  const groups = new Map<string, HazardGroup>();
  for (const row of rows) {
    const slug = row.tag!; // non-null by the isNotNull filter above
    const group = groups.get(slug) ?? { slug, name: HAZARD_LABELS[slug] ?? slug, recalls: [] };
    // One recall can carry several hazard paragraphs that reduce to the same tag (two
    // different fire descriptions, say). Count it once, or it renders twice and inflates
    // the badge. The reverse is intended: a recall belongs to every tag it matches.
    if (!group.recalls.some(r => r.recallId === row.recallId)) {
      group.recalls.push({
        recallId: row.recallId,
        title: row.title,
        url: row.url,
        recallDate: row.recallDate,
      });
    }
    groups.set(slug, group);
  }

  // recallDate is an ISO string, so a string compare is already chronological.
  for (const group of groups.values()) {
    group.recalls.sort((a, b) => b.recallDate.localeCompare(a.recallDate));
    // Ingest appends indefinitely, so groups only grow. Long before the page weight
    // matters, an unbroken list stops being browsable — that is the point to reach for
    // Astro's paginate() in getStaticPaths. Warn in the build log rather than rely on
    // anyone remembering to check.
    if (group.recalls.length > PAGINATE_THRESHOLD) {
      console.warn(
        `[hazards] ${group.slug} has ${group.recalls.length} recalls — consider paginating`
      );
    }
  }

  // Biggest hazards first, so the listing page leads with what actually matters.
  return [...groups.values()].sort((a, b) => b.recalls.length - a.recalls.length);
}
