import { describe, expect, it } from 'vitest';
import {
  HAZARD_TAGS,
  hazardLabel,
  hazardTag,
  isChildProduct,
  mapRecalls,
  parseRecallResponse,
  RecallSchemaError,
  type RecallItem,
} from './recalls';

function recall(overrides: Partial<RecallItem> = {}): RecallItem {
  return { RecallID: 1, Title: 'Recall', RecallDate: '2026-07-30T00:00:00', ...overrides };
}

describe('hazardTag', () => {
  it.each([
    ['Infants can suffocate: suffocation hazard', 'suffocation'],
    ['The dresser can tip over, posing an entrapment hazard', 'tip-over'],
    ['The crib slats can cause entrapment', 'entrapment'],
    ['Small parts can detach, posing a choking hazard', 'choking'],
    ['The high chair can collapse', 'fall'],
    ['The charger can overheat, posing a burn hazard', 'fire'],
    ['Risk of drowning in the bath seat', 'drowning'],
  ])('tags %j as %s', (text, tag) => {
    expect(hazardTag(text)).toBe(tag);
  });

  it('prefers battery over choking for button-cell ingestion', () => {
    expect(
      hazardTag('The button cell battery can be accessed and swallowed, posing a choking hazard')
    ).toBe('battery');
  });

  it('prefers tip-over over fall for dresser recalls', () => {
    expect(hazardTag('The dresser is unstable and can tip over, posing a fall hazard')).toBe(
      'tip-over'
    );
  });

  it('returns null when no pattern matches', () => {
    expect(hazardTag('The paint contains lead, which is toxic')).toBeNull();
  });
});

describe('HAZARD_TAGS', () => {
  it('uses unique, URL-safe tags', () => {
    const tags = HAZARD_TAGS.map(h => h.tag);
    expect(new Set(tags).size).toBe(tags.length);
    for (const tag of tags) expect(tag).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe('hazardLabel', () => {
  it('maps a known tag to its heading', () => {
    expect(hazardLabel('battery')).toBe('Button battery ingestion');
  });

  it('falls back to the raw slug for an unknown tag', () => {
    expect(hazardLabel('retired-tag')).toBe('retired-tag');
  });
});

describe('isChildProduct', () => {
  it('matches a keyword in the title', () => {
    expect(isChildProduct(recall({ Title: 'Acme Recalls Cribs' }))).toBe(true);
  });

  it('matches a keyword in a product name', () => {
    expect(
      isChildProduct(recall({ Title: 'Acme Recall', Products: [{ Name: 'Infant Swing' }] }))
    ).toBe(true);
  });

  it('matches a keyword that only appears in the hazard text', () => {
    expect(
      isChildProduct(
        recall({
          Title: 'Acme Recalls Dressers',
          Hazards: [{ Name: 'Tip-over hazard; children can be crushed' }],
        })
      )
    ).toBe(true);
  });

  it('rejects an adult product', () => {
    expect(
      isChildProduct(
        recall({ Title: 'Acme Recalls Lawn Mowers', Description: 'The blade can detach.' })
      )
    ).toBe(false);
  });
});

describe('parseRecallResponse', () => {
  it('accepts a minimal record and strips unknown keys', () => {
    const [item] = parseRecallResponse([{ ...recall(), SomethingNew: 'ignored' }]);
    expect(item).toEqual(recall());
  });

  it('throws RecallSchemaError when a required field is missing', () => {
    expect(() => parseRecallResponse([{ RecallID: 1 }])).toThrow(RecallSchemaError);
  });

  it('throws when the root is not an array', () => {
    expect(() => parseRecallResponse({ error: 'nope' })).toThrow(/\(root\)/);
  });

  it('caps the issue list in the error message', () => {
    const bad = Array.from({ length: 8 }, () => ({ RecallID: 'not a number' }));
    let error: unknown;
    try {
      parseRecallResponse(bad);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecallSchemaError);
    const message = (error as Error).message;
    // Each record fails RecallID, Title, and RecallDate: 24 issues, 5 shown.
    expect(message.match(/^ {2}\d+\./gm)).toHaveLength(5);
    expect(message).toContain('…and 19 more');
  });
});

describe('mapRecalls', () => {
  it('drops adult products and falls back when there is no product name', () => {
    const cards = mapRecalls([
      recall({ RecallID: 1, Title: 'Baby Monitor Recall' }),
      recall({ RecallID: 2, Title: 'Lawn Mower Recall' }),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: 1, productName: 'No details provided' });
  });
});
