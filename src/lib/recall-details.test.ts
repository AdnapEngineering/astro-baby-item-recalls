import { describe, expect, it } from 'vitest';
import type { RecallRow } from '../db/schema';
import { assembleRecallDetails, toRecallSummary } from './recall-details';
import { filterRecalls, toSearchEntry } from './search';

function recallRow(recallId: number, overrides: Partial<RecallRow> = {}): RecallRow {
  return {
    recallId,
    recallNumber: null,
    title: `Recall ${recallId}`,
    description: null,
    recallDate: '2026-01-01T00:00:00',
    lastPublishDate: null,
    url: null,
    imageUrl: null,
    imageCaption: null,
    consumerContact: null,
    remedy: null,
    injuries: null,
    unitsText: null,
    soldAt: null,
    country: null,
    firstSeen: '2026-01-02T00:00:00.000Z',
    lastSeen: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('assembleRecallDetails', () => {
  it('orders newest first, breaking date ties by ID', () => {
    const details = assembleRecallDetails(
      [
        recallRow(1, { recallDate: '2026-01-01T00:00:00' }),
        recallRow(2, { recallDate: '2026-03-01T00:00:00' }),
        recallRow(3, { recallDate: '2026-01-01T00:00:00' }),
      ],
      [],
      []
    );
    expect(details.map(d => d.recallId)).toEqual([2, 3, 1]);
  });

  it('attaches hazards and remedy options, deduplicating tags and options', () => {
    const [detail] = assembleRecallDetails(
      [recallRow(1)],
      [
        { recallId: 1, name: 'Can overheat', tag: 'fire' },
        { recallId: 1, name: 'Can burn', tag: 'fire' },
        { recallId: 1, name: 'Contains lead', tag: null },
      ],
      [
        { recallId: 1, option: 'Refund' },
        { recallId: 1, option: 'Refund' },
        { recallId: 1, option: 'Replace' },
      ]
    );
    expect(detail.hazardTexts).toEqual(['Can overheat', 'Can burn', 'Contains lead']);
    expect(detail.hazardTags).toEqual([{ slug: 'fire', label: 'Fire, burn, or shock' }]);
    expect(detail.remedyOptions).toEqual(['Refund', 'Replace']);
  });

  it('ignores child rows whose recall is missing', () => {
    const details = assembleRecallDetails(
      [recallRow(1)],
      [{ recallId: 99, name: 'Orphan', tag: 'fire' }],
      [{ recallId: 99, option: 'Refund' }]
    );
    expect(details).toHaveLength(1);
    expect(details[0].hazardTexts).toEqual([]);
  });
});

describe('toRecallSummary', () => {
  it('uses the image caption as alt text, falling back to the title', () => {
    const [withCaption, withoutCaption] = assembleRecallDetails(
      [
        recallRow(2, { imageCaption: 'Front view of the stroller' }),
        recallRow(1, { title: 'Acme Stroller Recall', imageCaption: '' }),
      ],
      [],
      []
    );
    expect(toRecallSummary(withCaption).imageAlt).toBe('Front view of the stroller');
    expect(toRecallSummary(withoutCaption).imageAlt).toBe('Acme Stroller Recall');
  });
});

describe('filterRecalls', () => {
  const entries = assembleRecallDetails(
    [
      recallRow(1, { title: 'Acme Recalls Cribs', soldAt: 'Sold at Target' }),
      recallRow(2, { title: 'Bobo Recalls Strollers', description: 'Folding stroller' }),
    ],
    [{ recallId: 2, name: 'The frame can collapse', tag: 'fall' }],
    []
  ).map(toSearchEntry);

  it('matches everything for an empty query', () => {
    expect(filterRecalls(entries, '  ')).toHaveLength(2);
  });

  it('requires every term, case-insensitively and in any order', () => {
    expect(filterRecalls(entries, 'TARGET crib').map(e => e.recallId)).toEqual([1]);
    expect(filterRecalls(entries, 'crib stroller')).toEqual([]);
  });

  it('searches hazard labels', () => {
    expect(filterRecalls(entries, 'collapse').map(e => e.recallId)).toEqual([2]);
  });

  it('filters by hazard tag', () => {
    expect(filterRecalls(entries, '', 'fall').map(e => e.recallId)).toEqual([2]);
    expect(filterRecalls(entries, 'crib', 'fall')).toEqual([]);
  });
});
