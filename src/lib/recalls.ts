import { z } from 'zod';

// The CPSC response is external input, so the schema — not a hand-written type — is the
// source of truth. Unknown keys are stripped rather than rejected (no `.strict()`): the
// API returns many fields this site ignores, and new ones should not break the build.
const RecallProductSchema = z.object({
  Name: z.string().optional(),
  NumberOfUnits: z.string().optional(),
});
const OrganizationSchema = z.object({ Name: z.string() });
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

/** Validates a raw CPSC response. Throws {@link RecallSchemaError} on mismatch. */
export function parseRecallResponse(json: unknown): RecallItem[] {
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
  const start = new Date(today);
  start.setDate(today.getDate() - days);
  return { start: isoDate(start), end: isoDate(today) };
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
const CHILD_KEYWORDS =
  /baby|infant|toddler|child|crib|stroller|teether|teething|nursery|bassinet|playpen|play yard|high ?chair|booster|car seat|pacifier|diaper|swaddle|bouncer|youth|kids?\b/i;

// CPSC's own Hazards[].HazardType and .HazardTypeID come back empty on every record — same
// as Products[].CategoryID above — so the category has to be derived from the hazard prose.
// First match wins, so order matters: 'battery' precedes 'choking' because button-cell
// recalls describe ingestion, and 'tip-over' precedes 'fall' because dresser recalls
// mention both.
// The tag is stored in the DB and doubles as the hazard page's URL slug, so it must stay
// lowercase and hyphenated. The label lives alongside it so a new tag cannot ship without
// a heading.
export const HAZARD_TAGS = [
  {
    tag: 'battery',
    label: 'Button battery ingestion',
    pattern: /button cell|coin batter|Reese's Law/i,
  },
  {
    tag: 'suffocation',
    label: 'Suffocation',
    pattern: /suffocation|obstruct.*breathing|infant support/i,
  },
  { tag: 'tip-over', label: 'Tip-over', pattern: /tip.?over|unstable|STURDY/i },
  { tag: 'entrapment', label: 'Entrapment', pattern: /entrapment/i },
  { tag: 'choking', label: 'Choking', pattern: /choking|small parts?\b/i },
  { tag: 'fall', label: 'Fall or collapse', pattern: /fall hazard|collapse/i },
  { tag: 'fire', label: 'Fire, burn, or shock', pattern: /fire|burn|overheat|shock/i },
  { tag: 'drowning', label: 'Drowning', pattern: /drowning|submersion/i },
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
