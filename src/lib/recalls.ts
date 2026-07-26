export type RecallProduct = { Name?: string };
export type Organization = { Name: string };
export type Hazard = { Name?: string };

export type RecallItem = {
  RecallID: number;
  Title: string;
  Description?: string;
  RecallDate: string;
  URL?: string;
  ConsumerContact?: string;
  Products?: RecallProduct[];
  Retailers?: Organization[];
  Hazards?: Hazard[];
};

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
  const data: RecallItem[] = await res.json();
  return mapRecalls(data);
}
