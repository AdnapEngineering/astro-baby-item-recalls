import { groupByHazard, type HazardGroup } from './hazard-groups';
import { getRecallDetails } from './recall-data';
import { toRecallSummary, type RecallSummary } from './recall-details';

export type HazardRecallGroup = HazardGroup<RecallSummary>;

/** Recalls in one group past which the detail page stops being comfortably browsable. */
const PAGINATE_THRESHOLD = 100;

/**
 * Groups every stored recall by hazard tag, largest group first.
 *
 * Runs at build time only: `getStaticPaths` turns each group into a static route, so the
 * deployed site never touches the database. Built on the same memoised load as the recall
 * pages, so it costs no extra queries — and hazards whose recall row is missing, or whose
 * paragraph matched no tag, are already absent from it.
 */
export async function getHazardGroups(): Promise<HazardRecallGroup[]> {
  const details = await getRecallDetails();
  const groups = groupByHazard(
    details.flatMap(detail => {
      const summary = toRecallSummary(detail);
      return detail.hazardTags.map(({ slug }) => ({ ...summary, tag: slug }));
    })
  );

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
