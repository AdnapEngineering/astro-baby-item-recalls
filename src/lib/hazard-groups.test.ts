import { describe, expect, it } from 'vitest';
import { groupByHazard, type HazardJoinRow } from './hazard-groups';

type Recall = { recallId: number; title: string; recallDate: string };

function row(tag: string, recallId: number, recallDate: string): HazardJoinRow<Recall> {
  return { tag, recallId, title: `Recall ${recallId}`, recallDate };
}

describe('groupByHazard', () => {
  it('returns no groups for no rows', () => {
    expect(groupByHazard([])).toEqual([]);
  });

  it('counts a recall once when several of its hazards share a tag', () => {
    const [fire] = groupByHazard([
      row('fire', 1, '2026-01-01T00:00:00'),
      row('fire', 1, '2026-01-01T00:00:00'),
    ]);
    expect(fire.recalls.map(r => r.recallId)).toEqual([1]);
  });

  it('lists a recall under every tag it matches', () => {
    const groups = groupByHazard([
      row('fire', 1, '2026-01-01T00:00:00'),
      row('choking', 1, '2026-01-01T00:00:00'),
    ]);
    expect(groups.map(g => g.slug).sort()).toEqual(['choking', 'fire']);
  });

  it('sorts recalls newest first and groups largest first', () => {
    const groups = groupByHazard([
      row('fire', 1, '2026-01-01T00:00:00'),
      row('choking', 2, '2026-02-01T00:00:00'),
      row('choking', 3, '2026-03-01T00:00:00'),
      row('choking', 4, '2026-01-15T00:00:00'),
    ]);
    expect(groups.map(g => g.slug)).toEqual(['choking', 'fire']);
    expect(groups[0].recalls.map(r => r.recallId)).toEqual([3, 2, 4]);
  });

  it('labels groups and drops the tag from each recall', () => {
    const [group] = groupByHazard([row('tip-over', 1, '2026-01-01T00:00:00')]);
    expect(group).toMatchObject({ slug: 'tip-over', name: 'Tip-over' });
    expect(group.recalls[0]).not.toHaveProperty('tag');
  });
});
