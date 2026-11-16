import { groupByHazard, type HazardGroup } from './hazard-groups';
import { getRecallDetails } from './recall-data';
import { toRecallSummary, type RecallSummary } from './recall-details';

export type HazardRecallGroup = HazardGroup<RecallSummary>;

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

  return groups;
}
