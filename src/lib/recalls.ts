import { z } from 'zod';

// The CPSC response is external input, so the schema — not a hand-written type — is the
// source of truth. Unknown keys are stripped rather than rejected (no `.strict()`): the
// API returns many fields this site ignores, and new ones should not break the build.
const RecallProductSchema = z.object({
  Name: z.string().optional(),
  Model: z.string().optional(),
  NumberOfUnits: z.string().optional(),
});
const OrganizationSchema = z.object({ Name: z.string() });
// Used only as search text, so a missing or null name is skipped rather than failing the run.
const CompanySchema = z.object({ Name: z.string().nullish() });
const HazardSchema = z.object({ Name: z.string().optional() });
const ImageSchema = z.object({ URL: z.string(), Caption: z.string().optional() });
const RemedySchema = z.object({ Name: z.string().optional() });
const RemedyOptionSchema = z.object({ Option: z.string() });
const InjurySchema = z.object({ Name: z.string().optional() });
const CountrySchema = z.object({ Country: z.string() });

export const RecallItemSchema = z.object({
  RecallID: z.number(),
  RecallNumber: z.string().optional(),
  Title: z.string(),
  Description: z.string().optional(),
  RecallDate: z.string(),
  LastPublishDate: z.string().optional(),
  URL: z.string().optional(),
  ConsumerContact: z.string().optional(),
  Products: z.array(RecallProductSchema).optional(),
  Retailers: z.array(OrganizationSchema).optional(),
  Manufacturers: z.array(CompanySchema).optional(),
  Importers: z.array(CompanySchema).optional(),
  Distributors: z.array(CompanySchema).optional(),
  Hazards: z.array(HazardSchema).optional(),
  Images: z.array(ImageSchema).optional(),
  Remedies: z.array(RemedySchema).optional(),
  RemedyOptions: z.array(RemedyOptionSchema).optional(),
  Injuries: z.array(InjurySchema).optional(),
  ManufacturerCountries: z.array(CountrySchema).optional(),
});

export const RecallResponseSchema = z.array(RecallItemSchema);

export type RecallItem = z.infer<typeof RecallItemSchema>;

/**
 * Thrown when the API responds successfully but with an unexpected shape. Distinct from a
 * network error so callers can treat "CPSC is down" (tolerable) differently from "CPSC
 * changed its contract" (a defect that should fail the build).
 */
export class RecallSchemaError extends Error {
  constructor(issues: z.core.$ZodIssue[]) {
    // A single renamed field yields one issue per record, so cap the detail — otherwise
    // the real message scrolls out of the build log.
    const detail = issues
      .slice(0, 5)
      .map(i => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    const more = issues.length > 5 ? `\n  …and ${issues.length - 5} more` : '';
    super(`CPSC recall API response did not match the expected schema:\n${detail}${more}`);
    this.name = 'RecallSchemaError';
  }
}

/**
 * Thrown when CPSC is failing on its side: an HTTP error, a network failure, or the error
 * record described below. Unlike {@link RecallSchemaError}, retrying later may succeed.
 */
export class CpscUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CpscUnavailableError';
  }
}

// When its own database is unreachable, the API still answers 200 OK, with a single fake
// recall: RecallID 0, every field null, and the error in the title ("Error retrieving
// Recalls: The underlying provider failed on Open."). Seen intermittently, at times on
// more than half of requests. Caught before validation so it reads as an outage rather
// than a contract change.
function cpscErrorTitle(json: unknown): string | null {
  if (!Array.isArray(json)) return null;
  for (const record of json as { RecallID?: unknown; Title?: unknown }[]) {
    if (
      record?.RecallID === 0 &&
      typeof record.Title === 'string' &&
      record.Title.startsWith('Error retrieving')
    ) {
      return record.Title;
    }
  }
  return null;
}

/**
 * Validates a raw CPSC response. Throws {@link CpscUnavailableError} on CPSC's error record
 * and {@link RecallSchemaError} on any other mismatch.
 */
export function parseRecallResponse(json: unknown): RecallItem[] {
  const errorTitle = cpscErrorTitle(json);
  if (errorTitle) throw new CpscUnavailableError(`CPSC reported an error: ${errorTitle}`);
  const result = RecallResponseSchema.safeParse(json);
  if (!result.success) throw new RecallSchemaError(result.error.issues);
  return result.data;
}

function isoDate(date: Date) {
  return date.toISOString().split('T')[0];
}

/** An inclusive RecallDate range, as YYYY-MM-DD strings. */
export type RecallWindow = { start: string; end: string };

/** The window covering the last `days` days, ending today. */
export function recallWindow(days: number, today = new Date()): RecallWindow {
  // UTC throughout, matching isoDate() and splitWindow(): local-time arithmetic here would
  // let a DST change on the host shift the start by a day.
  const start = new Date(today);
  start.setUTCDate(today.getUTCDate() - days);
  return { start: isoDate(start), end: isoDate(today) };
}

/**
 * Splits a window into consecutive chunks of at most `maxDays` days. Each chunk starts on
 * the day the previous one ended — the API's boundary handling is undocumented, so a
 * one-day overlap costs a few duplicate records (deduplicated by the caller) rather than
 * risking a day falling between two requests.
 */
export function splitWindow(dateWindow: RecallWindow, maxDays: number): RecallWindow[] {
  // Chunks overlap by a day, so a one-day chunk would never advance.
  if (maxDays < 2) throw new RangeError(`maxDays must be at least 2, got ${maxDays}`);
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const end = day(dateWindow.end);
  const chunks: RecallWindow[] = [];
  let start = day(dateWindow.start);
  for (;;) {
    const chunkEnd = new Date(start);
    chunkEnd.setUTCDate(start.getUTCDate() + maxDays - 1);
    if (chunkEnd >= end) {
      chunks.push({ start: isoDate(start), end: dateWindow.end });
      return chunks;
    }
    chunks.push({ start: isoDate(start), end: isoDate(chunkEnd) });
    start = chunkEnd;
  }
}

// RecallDateStart/RecallDateEnd are the REST API's documented filter params. The
// `field_rc_*` names this previously used belong to the saferproducts.gov website's
// Drupal views — the API ignores them and returns every recall since 1973 (~27MB).
// Takes a window rather than a day count so the ingest can reuse the exact range it
// fetched when deciding which stored recalls CPSC has since withdrawn.
export function buildApiUrl({ start, end }: RecallWindow) {
  return `https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=${start}&RecallDateEnd=${end}`;
}

// The CPSC API has no usable product category — the `Products[].CategoryID` and
// `.Type` fields come back empty on every record — so keyword matching is the only
// way to narrow results to children's products. Terms are matched against the recall
// title, description, product names, and hazard text; edit this list to tune what the
// site shows. Hazard text is included so that recalls which only identify their victims
// in the hazard (STURDY Act dresser tip-overs, magnet and button-battery ingestion)
// are not dropped — at the cost of occasionally admitting an adult product whose hazard
// mentions child-resistance, such as lighters.
// The product-type terms (toy, doll, plush…) carry word boundaries: unbounded, "doll" would
// match "Dollar Tree" and "toy" would match "Toyota".
const CHILD_KEYWORDS =
  /baby|infant|toddler|child|crib|stroller|teether|teething|nursery|bassinet|playpen|play yard|high ?chair|booster|car seat|pacifier|diaper|swaddle|bouncer|youth|sippy|bunk beds?\b|\bplush|\bdolls?\b|\btoys?\b|kids?\b/i;

// CPSC's own Hazards[].HazardType and .HazardTypeID come back empty on every record — same
// as Products[].CategoryID above — so the category has to be derived from the hazard prose.
// First match wins, so order matters: 'battery' and 'magnet' precede 'choking' because
// those recalls describe ingestion, 'tip-over' precedes 'fall' because dresser recalls
// mention both, and 'chemical' precedes 'poisoning' so lead poisoning lands under lead.
// The tag is stored in the DB and doubles as the hazard page's URL slug, so it must stay
// lowercase and hyphenated. The label lives alongside it so a new tag cannot ship without
// a heading. Tags are assigned at ingest: after editing this list, re-ingest a wide window
// (INGEST_DAYS) so recalls already stored pick up the change.
export const HAZARD_TAGS = [
  {
    tag: 'battery',
    label: 'Button battery ingestion',
    pattern: /button cell|coin batter|Reese's Law/i,
  },
  {
    // Narrower than /magnet/: a cooler whose latch magnet detaches is a choking recall.
    tag: 'magnet',
    label: 'Magnet ingestion',
    pattern: /magnet ingestion|high-powered magnet|loose magnet/i,
  },
  {
    tag: 'suffocation',
    label: 'Suffocation',
    pattern: /suffocation|obstruct.*breathing|infant support/i,
  },
  { tag: 'tip-over', label: 'Tip-over', pattern: /tip.?over|unstable|STURDY/i },
  { tag: 'entrapment', label: 'Entrapment', pattern: /entrapment/i },
  { tag: 'strangulation', label: 'Strangulation', pattern: /strangulat/i },
  { tag: 'choking', label: 'Choking', pattern: /choking|small parts?\b/i },
  { tag: 'fall', label: 'Fall or collapse', pattern: /fall hazard|collapse/i },
  {
    tag: 'fire',
    label: 'Fire, burn, or shock',
    pattern: /fire|burn|overheat|shock|flame|electrocut/i,
  },
  { tag: 'drowning', label: 'Drowning', pattern: /drowning|submersion/i },
  {
    // Not a bare /lead/: hazard paragraphs say "can lead to serious injury" constantly.
    tag: 'chemical',
    label: 'Lead or chemical exposure',
    pattern:
      /\blead (?:poisoning|paint|content|concentration)|(?:levels of|contains?) lead\b|phthalate|asbestos/i,
  },
  {
    tag: 'poisoning',
    label: 'Poisoning',
    pattern: /poison|child-resistant/i,
  },
  { tag: 'crash', label: 'Crash or head injury', pattern: /crash|head injury/i },
  { tag: 'laceration', label: 'Cut or impalement', pattern: /lacerat|impale|amputat/i },
] as const satisfies readonly { tag: string; label: string; pattern: RegExp }[];

/** Derives a short, filterable category from CPSC's hazard paragraph. Null when unmatched. */
export function hazardTag(name: string): string | null {
  return HAZARD_TAGS.find(({ pattern }) => pattern.test(name))?.tag ?? null;
}

/**
 * Human-readable heading for a stored tag. Rows tagged by an older ingest can carry a tag
 * since removed from HAZARD_TAGS, so an unknown tag falls back to the raw slug.
 */
export function hazardLabel(tag: string): string {
  return HAZARD_TAGS.find(h => h.tag === tag)?.label ?? tag;
}

// What kind of item a recall covers, so parents can browse by the thing they own rather
// than by hazard. Same reason as HAZARD_TAGS: CPSC's Products[].CategoryID is always empty.
// Unlike hazard tags these are NOT stored — they are derived at build time from fields the
// recall row already holds (see productTypes below), so editing this table takes effect on
// the next build with no migration or re-ingest.
// Every matching type applies, not just the first: a crib-and-dresser combo belongs on both
// pages. Word boundaries guard the terms that would otherwise misfire — "dresses" inside
// "addresses", "swing" inside "swing-arm lamp", "doll" inside "Dollar Tree", "toy" inside
// "Toyota". Ambiguous words are only matched in a qualifying phrase: a bare "booster" can be
// a car seat or a dining seat, a bare "jumper" can be a dress, a bare "gate" or "cabinet"
// says nothing about safety, and a bare "helmet" can be a novelty popcorn bucket. The tag
// doubles as the /products/<tag>/ URL slug, so it must stay lowercase and hyphenated. Table order is the order the products page lists.
export const PRODUCT_TYPES = [
  {
    tag: 'sleep',
    label: 'Cribs, bassinets & sleep',
    pattern:
      /\bcribs?\b|bassinets?|\bplay ?yards?\b|\bplaypens?\b|\bsleepers?\b|\bsleep(?:ing)? (?:sacks?|bags?|pods?|positioners?)\b|\bswaddl|\b(?:infant|baby) (?:loungers?|nests?)\b|\bsupport cushions?\b|\bbed rails?\b|\bnap mats?\b/i,
  },
  {
    tag: 'car-seat',
    label: 'Car seats & boosters',
    pattern: /\bcar seats?\b|\bbelt.?positioning boosters?\b/i,
  },
  {
    tag: 'stroller',
    label: 'Strollers & carriers',
    pattern:
      /\bstrollers?\b|\bprams?\b|\btravel systems?\b|\b(?:baby|infant|soft|backpack|frame|hip ?seat) carriers?\b|\bbaby wraps?\b|\bslings?\b|\bwagons?\b/i,
  },
  {
    tag: 'feeding',
    label: 'Feeding',
    pattern:
      /\bhigh ?chairs?\b|\bhook-on (?:high )?chairs?\b|\bdining boosters?\b|\bbottles?\b|\bsippy\b|\bpacifiers?\b|\bteethers?\b|\bteething\b|\bbibs?\b|\bbreast ?pumps?\b|\bformula\b|\bspoons?\b|\bstraw cups?\b|\bsnack (?:cups?|catchers?)\b|\bfeeding\b|\bnursing pillows?\b/i,
  },
  {
    tag: 'bath',
    label: 'Bath & potty',
    pattern:
      /\bbaths?\b|\bbath ?tubs?\b|\b(?:baby|infant) tubs?\b|\bbathers?\b|\bpott(?:y|ies)\b|\btoilet trainers?\b/i,
  },
  {
    tag: 'furniture',
    label: 'Dressers & furniture',
    pattern:
      /\bdressers?\b|\bchests? of drawers\b|\bdrawer chests?\b|\bwardrobes?\b|\barmoires?\b|\bbookcases?\b|\bbookshel(?:f|ves)\b|\b(?:bunk|loft|toddler|kids'?|children'?s) beds?\b|\bchanging (?:tables?|stations?)\b|\brocking chairs?\b|\b(?:glider|nursery) (?:rockers?|gliders?)\b|\bnightstands?\b|\b(?:kids'?|children'?s|toddler) (?:tables?|chairs?)\b|\btoy (?:chests?|boxes|storage)\b|\bstorage cabinets?\b|\b(?:tower|step) stools?\b|\b(?:learning|standing|toddler) towers?\b/i,
  },
  {
    tag: 'gear',
    label: 'Bouncers, swings & walkers',
    pattern:
      /\bbouncers?\b|\bbouncy seats?\b|\bswings?\b(?![-\w])|\bwalkers?\b|\bactivity (?:cent(?:er|re)s?|tables?|gyms?)\b|\bplay gyms?\b|\b(?:baby|infant|door(?:way)?|activity) jumpers?\b|\bjumperoos?\b|\bexersaucers?\b|\b(?:infant|baby) (?:seats?|rockers?)\b|\bfloor seats?\b/i,
  },
  {
    tag: 'home-safety',
    label: 'Home safety',
    pattern:
      /\b(?:baby|safety|pet|stair|security|pressure.?mounted|hardware.?mounted) gates?\b|\b(?:baby|video|audio) monitors?\b|\boutlet (?:covers?|plugs?)\b|\b(?:cabinet|drawer) (?:locks?|latches?)\b|\b(?:corner|edge) (?:guards?|protectors?)\b|\bwindow (?:guards?|stops?)\b|\banti.?tip (?:kits?|straps?|devices?)\b|\bfurniture (?:anchors?|straps?)\b|\bdoor ?knob covers?\b/i,
  },
  {
    tag: 'toys',
    label: 'Toys',
    pattern:
      /\btoys?\b|\bdolls?\b|\bplush|\bstuffed animals?\b|\brattles?\b|\bbuilding (?:blocks?|sets?|bricks?|cubes?)\b|\bmagnetic (?:cubes?|blocks?|tiles?)\b|\bpuzzles?\b|\bslime\b|\bsquish(?:y|ies)\b|\bputty\b|\bplay ?sets?\b|\bplayhouses?\b|\bcrayons?\b|\bfigurines?\b|\baction figures?\b|\bkites?\b|\bplay tents?\b|\b(?:busy|story|picture|board) books?\b|\b(?:finger ?painting|painting|craft|handwriting practice) kits?\b|\bwater balloons?\b/i,
  },
  {
    tag: 'outdoor',
    label: 'Bikes, helmets & outdoor play',
    pattern:
      /\b(?:bicycle|bike|youth|multi-purpose|children'?s|kids'?|toddler|ski|skate(?:board)?) helmets?\b|\btricycles?\b|\bscooters?\b|\b(?:balance|kids'?|children'?s|youth) bikes?\b|\bcargo (?:e-?)?bikes?\b|\bbicycle child (?:seats?|carriers?)\b|\bbike (?:seats?|trailers?)\b|\bride-?ons?\b|\ball-terrain vehicles?\b|\bATVs?\b|\btrampolines?\b|\bswing sets?\b|\bziplines?\b|\b(?:above-ground|kiddie|inflatable) pools?\b/i,
  },
  {
    tag: 'clothing',
    label: 'Clothing, shoes & jewelry',
    pattern:
      /\bpajamas?\b|\bpyjamas?\b|\bsleepwear\b|\bnightgowns?\b|\brobes?\b|\bhoodies?\b|\bsweatshirts?\b|\bjackets?\b|\bcoats?\b|\bdrawstrings?\b|\b(?:t-)?shirts?\b|\bonesies?\b|\bbodysuits?\b|\brompers?\b|\bdresses\b|\bleggings\b|\bpants\b|\bsocks?\b|\bshoes?\b|\bsneakers?\b|\bsandals?\b|\bboots?\b|\bfootwear\b|\bhats?\b|\bbeanies?\b|\bmittens?\b|\bjewelry\b|\bnecklaces?\b|\bbracelets?\b|\bearrings?\b|\bclothing\b|\bapparel\b|\bgarments?\b|\bswim(?:suits?|wear)\b|\bcostumes?\b|\bskirts?\b|\bheadbands?\b|\bpurses?\b/i,
  },
] as const satisfies readonly { tag: string; label: string; pattern: RegExp }[];

/**
 * Every product type a recall covers, in PRODUCT_TYPES order. Empty when nothing matches.
 *
 * Matches the title and product names first, and falls back to the description only when
 * those name no type: descriptions mention neighbouring products in passing ("fits most
 * strollers"), which would otherwise pile extra types onto a recall that is already typed.
 * Hazard text is never used — "children can fall from the crib" says nothing about what a
 * high-chair recall is.
 */
export function productTypes(recall: {
  title: string;
  productNames: (string | null)[];
  description: string | null;
}): string[] {
  const matching = (text: string) =>
    PRODUCT_TYPES.filter(({ pattern }) => pattern.test(text)).map(({ tag }) => tag);
  const named = matching([recall.title, ...recall.productNames].filter(Boolean).join(' '));
  return named.length || !recall.description ? named : matching(recall.description);
}

/** Heading for a product type; an unknown slug falls back to itself, like hazardLabel. */
export function productTypeLabel(tag: string): string {
  return PRODUCT_TYPES.find(p => p.tag === tag)?.label ?? tag;
}

export function isChildProduct(item: RecallItem) {
  const haystack = [
    item.Title,
    item.Description,
    ...(item.Products ?? []).map(p => p.Name),
    ...(item.Hazards ?? []).map(h => h.Name),
  ]
    .filter(Boolean)
    .join(' ');
  return CHILD_KEYWORDS.test(haystack);
}
