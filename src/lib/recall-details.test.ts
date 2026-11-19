import { describe, expect, it } from 'vitest';
import type { RecallRow } from '../db/schema';
import type { RecallDetail } from './recall-details';
import {
  assembleRecallDetails,
  assertRecallsLoaded,
  dropDuplicateRecalls,
  recallImages,
  toRecallSummary,
} from './recall-details';
import { filterRecalls, toSearchEntry } from './search';

function recallRow(recallId: number, overrides: Partial<RecallRow> = {}): RecallRow {
  return {
    recallId,
    recallNumber: null,
    title: `Recall ${recallId}`,
    description: null,
    productIdentifiers: [],
    recallDate: '2026-01-01T00:00:00',
    lastPublishDate: null,
    url: null,
    imageUrl: null,
    imageCaption: null,
    images: [],
    companyNames: [],
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

  it('searches product names and model numbers', () => {
    const [entry] = assembleRecallDetails(
      [
        recallRow(3, {
          productIdentifiers: [{ name: 'Acme Infant Sleeper', model: 'IS-204' }],
        }),
      ],
      [],
      []
    ).map(toSearchEntry);
    expect(filterRecalls([entry], 'Acme IS-204').map(e => e.recallId)).toEqual([3]);
  });

  it('searches hazard labels', () => {
    expect(filterRecalls(entries, 'collapse').map(e => e.recallId)).toEqual([2]);
  });

  it('filters by hazard tag', () => {
    expect(filterRecalls(entries, '', 'fall').map(e => e.recallId)).toEqual([2]);
    expect(filterRecalls(entries, 'crib', 'fall')).toEqual([]);
  });

  it('filters by product type, alone and with a hazard', () => {
    expect(filterRecalls(entries, '', null, 'sleep').map(e => e.recallId)).toEqual([1]);
    expect(filterRecalls(entries, '', 'fall', 'stroller').map(e => e.recallId)).toEqual([2]);
    expect(filterRecalls(entries, '', 'fall', 'sleep')).toEqual([]);
  });

  it('searches product type labels', () => {
    expect(filterRecalls(entries, 'bassinets').map(e => e.recallId)).toEqual([1]);
  });
});

describe('product types on assembled recalls', () => {
  it('derives labelled types from the title and product names', () => {
    const [detail] = assembleRecallDetails(
      [
        recallRow(1, {
          title: 'Acme Recalls Nursery Products',
          productIdentifiers: [{ name: 'Acme Infant Car Seat', model: 'CS-1' }],
        }),
      ],
      [],
      []
    );
    expect(detail.productTypes).toEqual([{ slug: 'car-seat', label: 'Car seats & boosters' }]);
    expect(toRecallSummary(detail).productTypes).toEqual(detail.productTypes);
  });
});

describe('dropDuplicateRecalls', () => {
  it('keeps the most recently seen copy of a recall number', () => {
    const kept = dropDuplicateRecalls([
      recallRow(10, { recallNumber: '26764', lastSeen: '2026-10-02T00:00:00.000Z' }),
      recallRow(11, { recallNumber: '26764', lastSeen: '2026-09-11T00:00:00.000Z' }),
    ]);
    expect(kept.map(r => r.recallId)).toEqual([10]);
  });

  it('falls back to the lower ID when both copies were seen together', () => {
    const kept = dropDuplicateRecalls([
      recallRow(11, { recallNumber: '26764' }),
      recallRow(10, { recallNumber: '26764' }),
    ]);
    expect(kept.map(r => r.recallId)).toEqual([10]);
  });

  it('keeps every row without a recall number', () => {
    expect(dropDuplicateRecalls([recallRow(1), recallRow(2)])).toHaveLength(2);
  });
});

describe('assembleRecallDetails with duplicates', () => {
  it('drops the duplicate and ignores its child rows', () => {
    const details = assembleRecallDetails(
      [
        recallRow(10, { recallNumber: '26764', lastSeen: '2026-10-02T00:00:00.000Z' }),
        recallRow(11, { recallNumber: '26764', lastSeen: '2026-09-11T00:00:00.000Z' }),
      ],
      [{ recallId: 11, name: 'Tip-over hazard', tag: 'tip-over' }],
      [{ recallId: 11, option: 'Refund' }]
    );
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ recallId: 10, hazardTags: [], remedyOptions: [] });
  });
});

describe('recallImages', () => {
  it('returns every stored image, hero first', () => {
    const images = [
      { url: 'https://example.com/front.jpg', caption: 'Front' },
      { url: 'https://example.com/label.jpg', caption: null },
    ];
    expect(
      recallImages(recallRow(1, { images, imageUrl: images[0].url, imageCaption: 'Front' }))
    ).toEqual(images);
  });

  it('falls back to the hero image on a row ingested before images were stored', () => {
    expect(
      recallImages(recallRow(1, { imageUrl: 'https://example.com/a.jpg', imageCaption: 'A' }))
    ).toEqual([{ url: 'https://example.com/a.jpg', caption: 'A' }]);
  });

  it('returns nothing for a recall with no image at all', () => {
    expect(recallImages(recallRow(1))).toEqual([]);
  });
});

describe('company names in search', () => {
  it('finds a recall by an importer named only in companyNames', () => {
    const details = assembleRecallDetails(
      [
        recallRow(1, { title: 'Bed Rails Recalled', companyNames: ['Papablic, Inc., of Chicago'] }),
        recallRow(2, { title: 'Strollers Recalled' }),
      ],
      [],
      []
    );
    const found = filterRecalls(details.map(toSearchEntry), 'papablic');
    expect(found.map(entry => entry.recallId)).toEqual([1]);
  });
});
describe('assertRecallsLoaded', () => {
  it('refuses an empty result in CI', () => {
    expect(() => assertRecallsLoaded([], true)).toThrow(/no recalls/);
  });

  it('allows an empty result outside CI, where the pages show their empty states', () => {
    expect(assertRecallsLoaded([], false)).toEqual([]);
  });

  it('passes recalls through unchanged', () => {
    const details = [{ recallId: 1 } as RecallDetail];
    expect(assertRecallsLoaded(details, true)).toBe(details);
  });
});
