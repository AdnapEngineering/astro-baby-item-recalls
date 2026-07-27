import { z } from 'zod';

// The CPSC response is external input, so the schema — not a hand-written type — is the
// source of truth. Unknown keys are stripped rather than rejected (no `.strict()`): the
// API returns many fields this site ignores, and new ones should not break the build.
const RecallProductSchema = z.object({ Name: z.string().optional() });
const OrganizationSchema = z.object({ Name: z.string() });
const HazardSchema = z.object({ Name: z.string().optional() });

export const RecallItemSchema = z.object({
  RecallID: z.number(),
  Title: z.string(),
  Description: z.string().optional(),
  RecallDate: z.string(),
  URL: z.string().optional(),
  ConsumerContact: z.string().optional(),
  Products: z.array(RecallProductSchema).optional(),
  Retailers: z.array(OrganizationSchema).optional(),
  Hazards: z.array(HazardSchema).optional(),
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

export type RecallCardItem = {
  id: number;
  name: string;
  reason: string;
  recallDate: string;
  link: string;
  consumerContact?: string;
  retailers: string[];
};

/** Default look-back window, in days, for the recalls list. */
export const DEFAULT_DAYS = 20;

/** Maximum number of recalls rendered, after child-product filtering. */
export const MAX_RECALLS = 20;

function isoDate(date: Date) {
  return date.toISOString().split('T')[0];
}

// RecallDateStart/RecallDateEnd are the REST API's documented filter params. The
// `field_rc_*` names this previously used belong to the saferproducts.gov website's
// Drupal views — the API ignores them and returns every recall since 1973 (~27MB).
export function buildApiUrl(days: number) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - days);
  return `https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=${isoDate(start)}&RecallDateEnd=${isoDate(today)}`;
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

export function mapRecalls(data: RecallItem[]): RecallCardItem[] {
  return data
    .filter(isChildProduct)
    .slice(0, MAX_RECALLS)
    .map(item => ({
      id: item.RecallID,
      name: item.Title,
      reason: item.Products?.[0]?.Name ?? 'No details provided',
      recallDate: item.RecallDate,
      link: item.URL ?? 'https://www.cpsc.gov/Recalls',
      consumerContact: item.ConsumerContact,
      retailers: item.Retailers?.map(r => r.Name) ?? [],
    }));
}

export async function fetchRecalls(days: number): Promise<RecallCardItem[]> {
  const res = await fetch(buildApiUrl(days));
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return mapRecalls(parseRecallResponse(await res.json()));
}
