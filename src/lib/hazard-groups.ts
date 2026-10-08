import { hazardLabel } from './recalls';

// Kept free of the DB client so the reshaping can be unit-tested on plain rows.

type GroupableRecall = { recallId: number; recallDate: string };

/** One recall–tag pairing, with untagged hazards already filtered out. */
export type HazardJoinRow<R extends GroupableRecall> = R & { tag: string };

export type HazardGroup<R extends GroupableRecall> = {
  slug: string;
  name: string;
  recalls: R[];
};

/** Reshapes flat recall–tag rows into one group per hazard tag, largest first. */
export function groupByHazard<R extends GroupableRecall>(
  rows: HazardJoinRow<R>[]
): HazardGroup<R>[] {
  const groups = new Map<string, HazardGroup<R>>();
  for (const { tag, ...rest } of rows) {
    const recall = rest as unknown as R;
    const group = groups.get(tag) ?? { slug: tag, name: hazardLabel(tag), recalls: [] };
    // One recall can carry several hazard paragraphs that reduce to the same tag (two
    // different fire descriptions, say). Count it once, or it renders twice and inflates
    // the badge. The reverse is intended: a recall belongs to every tag it matches.
    if (!group.recalls.some(r => r.recallId === recall.recallId)) {
      group.recalls.push(recall);
    }
    groups.set(tag, group);
  }

  // recallDate is an ISO string, so a string compare is already chronological.
  for (const group of groups.values()) {
    group.recalls.sort((a, b) => b.recallDate.localeCompare(a.recallDate));
  }

  // Biggest hazards first, so the listing page leads with what actually matters.
  return [...groups.values()].sort((a, b) => b.recalls.length - a.recalls.length);
}
