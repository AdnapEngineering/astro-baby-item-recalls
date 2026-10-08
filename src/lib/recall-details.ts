import type { HazardRow, RecallRow, RemedyOptionRow } from '../db/schema';
import { formatRecallDate } from './format';
import { hazardLabel } from './recalls';

// Kept free of the DB client so the assembly can be unit-tested and so client islands can
// import the types without dragging libSQL into the browser bundle.

export type RecallDetail = RecallRow & {
  /** Full CPSC hazard paragraphs, in API order. */
  hazardTexts: string[];
  /** Distinct hazard categories, each with the label used for its hazard page. */
  hazardTags: { slug: string; label: string }[];
  /** Refund | Repair | Replace, deduplicated. */
  remedyOptions: string[];
};

/**
 * Joins child rows onto their recalls in memory and orders the result newest first.
 * Three flat queries plus this beat a per-recall query: the whole table is read at build
 * time anyway, and it stays a few round trips no matter how many recalls are stored.
 */
export function assembleRecallDetails(
  recallRows: RecallRow[],
  hazardRows: HazardRow[],
  optionRows: RemedyOptionRow[]
): RecallDetail[] {
  const details = new Map<number, RecallDetail>(
    recallRows.map(row => [
      row.recallId,
      { ...row, hazardTexts: [], hazardTags: [], remedyOptions: [] },
    ])
  );

  for (const { recallId, name, tag } of hazardRows) {
    const detail = details.get(recallId);
    if (!detail) continue; // orphaned child row; nothing to attach it to
    detail.hazardTexts.push(name);
    // Several paragraphs can reduce to one tag — list each category once.
    if (tag && !detail.hazardTags.some(t => t.slug === tag)) {
      detail.hazardTags.push({ slug: tag, label: hazardLabel(tag) });
    }
  }

  for (const { recallId, option } of optionRows) {
    const detail = details.get(recallId);
    if (detail && !detail.remedyOptions.includes(option)) detail.remedyOptions.push(option);
  }

  // recallDate is an ISO string, so a string compare is already chronological. Ties fall
  // back to the ID so the order is stable between builds.
  return [...details.values()].sort(
    (a, b) => b.recallDate.localeCompare(a.recallDate) || b.recallId - a.recallId
  );
}

/** What a list row needs: enough to recognise a product and see the remedy at a glance. */
export type RecallSummary = {
  recallId: number;
  title: string;
  recallDate: string;
  /**
   * Formatted at build time, not in the browser: a client-side format would use the
   * visitor's time zone and could disagree with the server-rendered HTML on hydration.
   */
  dateLabel: string;
  imageUrl: string | null;
  imageAlt: string;
  remedy: string | null;
  remedyOptions: string[];
  hazardTags: { slug: string; label: string }[];
};

export function toRecallSummary(detail: RecallDetail): RecallSummary {
  return {
    recallId: detail.recallId,
    title: detail.title,
    recallDate: detail.recallDate,
    dateLabel: formatRecallDate(detail.recallDate),
    imageUrl: detail.imageUrl,
    imageAlt: detail.imageCaption || detail.title,
    remedy: detail.remedy,
    remedyOptions: detail.remedyOptions,
    hazardTags: detail.hazardTags,
  };
}
