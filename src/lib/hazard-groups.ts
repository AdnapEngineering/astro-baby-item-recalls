import { hazardLabel } from './recalls';

// Kept free of the DB client so the reshaping can be unit-tested on plain rows.

export type HazardRecall = {
  recallId: number;
  title: string;
  url: string | null;
  recallDate: string;
};

/** One row of the hazards→recalls join, with untagged hazards already filtered out. */
export type HazardJoinRow = HazardRecall & { tag: string };

export type HazardGroup = {
  slug: string;
  name: string;
  recalls: HazardRecall[];
};

/** Reshapes the flat hazards→recalls join into one group per hazard tag, largest first. */
export function groupByHazard(rows: HazardJoinRow[]): HazardGroup[] {
  const groups = new Map<string, HazardGroup>();
  for (const { tag, ...recall } of rows) {
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
