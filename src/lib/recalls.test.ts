import { describe, expect, it } from 'vitest';
import {
  buildApiUrl,
  CpscUnavailableError,
  HAZARD_TAGS,
  hazardLabel,
  hazardTag,
  isChildProduct,
  parseRecallResponse,
  PRODUCT_TYPES,
  productTypeLabel,
  productTypes,
  RecallSchemaError,
  recallWindow,
  splitWindow,
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
    ['The cubes can liberate loose high-powered magnets, posing an ingestion hazard', 'magnet'],
    ['The drawstrings can cause death or serious injury from strangulation', 'strangulation'],
    ['The zipper contains levels of lead that exceed the federal lead paint ban', 'chemical'],
    ['The coin purses contain higher phthalate concentration levels', 'chemical'],
    ['The wipes contain lidocaine, which must be in child-resistant packaging', 'poisoning'],
    ['The helmets can fail to protect the user in the event of a crash', 'crash'],
    ['The dive sticks exceed the compress limit, posing an impalement hazard', 'laceration'],
    ['The containers lack flame mitigation devices', 'fire'],
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

  it('prefers magnet over choking for high-powered magnets', () => {
    expect(
      hazardTag('The high-powered magnets fit within the small parts cylinder, posing a hazard')
    ).toBe('magnet');
  });

  it('leaves a magnet that is only a choking-size part under choking', () => {
    expect(hazardTag("The cooler's latch magnet can detach, posing a choking hazard")).toBe(
      'choking'
    );
  });

  it('files lead poisoning under chemical exposure, not poisoning', () => {
    expect(hazardTag('The cup has high lead content, posing a lead poisoning hazard')).toBe(
      'chemical'
    );
  });

  it('does not read the verb "lead" as the metal', () => {
    expect(hazardTag('The strap can detach, which can lead to serious injury')).toBeNull();
  });

  it('returns null when no pattern matches', () => {
    expect(hazardTag('The poles can shed fibers, posing a risk of skin irritation')).toBeNull();
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

describe('productTypes', () => {
  const typesOf = (title: string, productNames: string[] = [], description: string | null = null) =>
    productTypes({ title, productNames, description });

  it.each([
    ['Acme Recalls Convertible Cribs Due to Entrapment Hazard', 'sleep'],
    ['Bobo Recalls Infant Loungers', 'sleep'],
    ['Graco Recalls Infant Car Seats', 'car-seat'],
    ['Evenflo Recalls Belt-Positioning Boosters', 'car-seat'],
    ['Bugaboo Recalls Strollers Due to Fall Hazard', 'stroller'],
    ['Ergo Recalls Soft Baby Carriers', 'stroller'],
    ['Stokke Recalls High Chairs', 'feeding'],
    ['Philips Recalls Breast Pumps', 'feeding'],
    ['Summer Recalls Infant Bath Seats', 'bath'],
    ['Acme Recalls Potty Training Seats', 'bath'],
    ['IKEA Recalls Chests of Drawers Due to Tip-Over Hazard', 'furniture'],
    ['Delta Recalls Toddler Beds', 'furniture'],
    ['Fisher-Price Recalls Infant Swings', 'gear'],
    ['Acme Recalls Baby Walkers', 'gear'],
    ['Regalo Recalls Baby Gates', 'home-safety'],
    ['Acme Recalls Video Baby Monitors', 'home-safety'],
    ['Safety 1st Recalls Cabinet Locks', 'home-safety'],
    ['Melissa & Doug Recalls Wooden Toys', 'toys'],
    ['Acme Recalls Plush Rattles', 'toys'],
    ["Carter's Recalls Children's Pajamas", 'clothing'],
    ['Acme Recalls Hoodies with Drawstrings', 'clothing'],
    ["Acme Children's LED Tutu Skirts Recalled", 'clothing'],
    ['Pillani Recalls Nursing Pillows', 'feeding'],
    ["Wiifo Children's Tower Stools Recalled", 'furniture'],
    ['Woodure Toddler Kitchen Step Stools Recalled', 'furniture'],
    ["Little Partners Recalls Children's Grow 'N Stow Folding Learning Towers", 'furniture'],
    ['Goody King Magnetic Building Cubes and Blocks Recalled', 'toys'],
    ["Tiny Land Children's Play Tents Recalled", 'toys'],
    ['Cobelae Busy Books Recalled', 'toys'],
    ['Favoto Bicycle Helmets Recalled', 'outdoor'],
    ["Semfri Children's Helmets Recalled", 'outdoor'],
    ['Yamazuki Recalls Youth All-Terrain Vehicles (ATVs)', 'outdoor'],
    ['Pacific Cycle Recalls Schwinn Bicycle Child Carriers', 'outdoor'],
    ['Gazelle Recalls Urban Arrow Cargo E-Bikes', 'outdoor'],
    ['Acme Recalls Balance Bikes', 'outdoor'],
    ['SereneLife Recalls Above-Ground Pools', 'outdoor'],
  ])('types %j as %s', (title, type) => {
    expect(typesOf(title)).toContain(type);
  });

  it('applies every matching type, in table order', () => {
    expect(typesOf('Acme Recalls Crib and Dresser Combos')).toEqual(['sleep', 'furniture']);
  });

  it('matches product names as well as the title', () => {
    expect(typesOf('Acme Recalls Nursery Items', ['Acme Glider Stroller'])).toEqual(['stroller']);
  });

  it('falls back to the description only when the title and names match nothing', () => {
    expect(typesOf('Acme Recalls Model 5', [], 'This high chair can tip over.')).toEqual([
      'feeding',
    ]);
    expect(typesOf('Acme Recalls Cribs', [], 'Fits most strollers and car seats.')).toEqual([
      'sleep',
    ]);
  });

  it('returns no types when nothing matches', () => {
    expect(typesOf('Acme Recalls Lighters', [], null)).toEqual([]);
  });

  it.each([
    'Dollar Tree Recalls Lamps',
    'Toyota Recalls Accessories',
    'Acme Recalls Swing-Arm Lamps',
    'Acme Recalls Tubular Frames',
    'Acme Recalls Products Sold at Addresses Nationwide',
    'Acme Recalls Booster Pumps',
    'Acme Recalls Jogger Strings',
    'Golden Link Recalls Popcorn Helmet Containers',
    'Giant Bicycle Recalls LED-Light Keys Included with Bike Lock Sets',
  ])('ignores the near-miss %j', title => {
    expect(typesOf(title)).toEqual([]);
  });

  it('does not read a dining booster as a car seat, or a jumper dress as gear', () => {
    expect(typesOf('Acme Recalls Dining Boosters')).toEqual(['feeding']);
    expect(typesOf("Acme Recalls Girls' Jumper Dresses")).toEqual(['clothing']);
  });
});

describe('PRODUCT_TYPES', () => {
  it('uses unique, URL-safe tags', () => {
    const tags = PRODUCT_TYPES.map(p => p.tag);
    expect(new Set(tags).size).toBe(tags.length);
    for (const tag of tags) expect(tag).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe('productTypeLabel', () => {
  it('maps a known tag to its heading and falls back to the slug', () => {
    expect(productTypeLabel('car-seat')).toBe('Car seats & boosters');
    expect(productTypeLabel('retired-type')).toBe('retired-type');
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

  it.each([
    'Melissa & Doug Recalls Fire Truck Activity Board Toys Due to Choking Hazard',
    'Acme Recalls Plush Bears',
    'Acme Recalls Fashion Dolls',
  ])('matches the product-type term in %j', title => {
    expect(isChildProduct(recall({ Title: title }))).toBe(true);
  });

  it.each(['Dollar Tree Stores Recalls Electric Balloon Pumps', 'Toyota Recalls Golf Carts'])(
    'does not match a product-type term inside another word: %j',
    title => {
      expect(isChildProduct(recall({ Title: title }))).toBe(false);
    }
  );

  it('rejects an adult product', () => {
    expect(
      isChildProduct(
        recall({ Title: 'Acme Recalls Lawn Mowers', Description: 'The blade can detach.' })
      )
    ).toBe(false);
  });
});

describe('parseRecallResponse', () => {
  it("reads CPSC's error record as an outage, not a schema change", () => {
    const error = { RecallID: 0, RecallDate: null, Title: 'Error retrieving Recalls: boom' };
    expect(() => parseRecallResponse([error])).toThrow(CpscUnavailableError);
  });

  it('accepts a minimal record and strips unknown keys', () => {
    const [item] = parseRecallResponse([{ ...recall(), SomethingNew: 'ignored' }]);
    expect(item).toEqual(recall());
  });

  it('preserves CPSC product names and model numbers', () => {
    const [item] = parseRecallResponse([
      { ...recall(), Products: [{ Name: 'Acme Infant Sleeper', Model: 'IS-204' }] },
    ]);
    expect(item.Products).toEqual([{ Name: 'Acme Infant Sleeper', Model: 'IS-204' }]);
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

describe('recallWindow', () => {
  it('spans the given number of days, ending today', () => {
    const today = new Date('2026-10-08T12:00:00Z');
    expect(recallWindow(30, today)).toEqual({ start: '2026-09-08', end: '2026-10-08' });
  });

  it('feeds the documented API date params', () => {
    const url = buildApiUrl({ start: '2026-09-08', end: '2026-10-08' });
    expect(url).toContain('RecallDateStart=2026-09-08&RecallDateEnd=2026-10-08');
  });
});

describe('splitWindow', () => {
  it('returns a short window unchanged', () => {
    expect(splitWindow({ start: '2026-10-01', end: '2026-10-05' }, 7)).toEqual([
      { start: '2026-10-01', end: '2026-10-05' },
    ]);
  });

  it('covers a long window in chunks that share their boundary day', () => {
    expect(splitWindow({ start: '2026-09-08', end: '2026-10-08' }, 7)).toEqual([
      { start: '2026-09-08', end: '2026-09-14' },
      { start: '2026-09-14', end: '2026-09-20' },
      { start: '2026-09-20', end: '2026-09-26' },
      { start: '2026-09-26', end: '2026-10-02' },
      { start: '2026-10-02', end: '2026-10-08' },
    ]);
  });

  it('crosses month and year boundaries', () => {
    expect(splitWindow({ start: '2025-12-28', end: '2026-01-05' }, 7)).toEqual([
      { start: '2025-12-28', end: '2026-01-03' },
      { start: '2026-01-03', end: '2026-01-05' },
    ]);
  });

  it('rejects chunks too short to advance', () => {
    expect(() => splitWindow({ start: '2026-10-01', end: '2026-10-05' }, 1)).toThrow(RangeError);
  });
});
