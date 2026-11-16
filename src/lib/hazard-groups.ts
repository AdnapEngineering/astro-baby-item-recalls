import { hazardLabel } from './recalls';

// Kept free of the DB client so the reshaping can be unit-tested on plain rows.

type GroupableRecall = { recallId: number; recallDate: string };

/** One recall–tag pairing, with untagged rows already filtered out. */
export type TagJoinRow<R extends GroupableRecall> = R & { tag: string };
/** One recall–hazard-tag pairing. */
export type HazardJoinRow<R extends GroupableRecall> = TagJoinRow<R>;

export type TagGroup<R extends GroupableRecall> = {
  slug: string;
  name: string;
  recalls: R[];
};
export type HazardGroup<R extends GroupableRecall> = TagGroup<R>;

/**
 * Reshapes flat recall–tag rows into one group per tag, largest first. Shared by the hazard
 * and product-type pages; `labelFor` turns a slug into the group's heading.
 */
export function groupByTag<R extends GroupableRecall>(
  rows: TagJoinRow<R>[],
  labelFor: (tag: string) => string
): TagGroup<R>[] {
  const groups = new Map<string, TagGroup<R>>();
  for (const { tag, ...rest } of rows) {
    const recall = rest as unknown as R;
    let group = groups.get(tag);
    if (!group) {
      group = { slug: tag, name: labelFor(tag), recalls: [] };
      groups.set(tag, group);
    }
    // One recall can carry several hazard paragraphs that reduce to the same tag (two
    // different fire descriptions, say). Count it once, or it renders twice and inflates
    // the badge. The reverse is intended: a recall belongs to every tag it matches.
    if (!group.recalls.some(r => r.recallId === recall.recallId)) {
      group.recalls.push(recall);
    }
  }

  // recallDate is an ISO string, so a string compare is already chronological.
  for (const group of groups.values()) {
    group.recalls.sort((a, b) => b.recallDate.localeCompare(a.recallDate));
  }

  // Biggest groups first, so a listing page leads with what actually matters.
  return [...groups.values()].sort((a, b) => b.recalls.length - a.recalls.length);
}

/** Reshapes flat recall–tag rows into one group per hazard tag, largest first. */
export function groupByHazard<R extends GroupableRecall>(
  rows: HazardJoinRow<R>[]
): HazardGroup<R>[] {
  return groupByTag(rows, hazardLabel);
}
