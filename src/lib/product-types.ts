import { groupByTag, type TagGroup } from './hazard-groups';
import { getRecallDetails } from './recall-data';
import { toRecallSummary, type RecallSummary } from './recall-details';
import { PRODUCT_TYPES, productTypeLabel } from './recalls';

export type ProductTypeRecallGroup = TagGroup<RecallSummary>;

/** Recalls in one group past which the detail page stops being comfortably browsable. */
const PAGINATE_THRESHOLD = 100;

/**
 * Groups every stored recall by product type, in PRODUCT_TYPES order — the order parents
 * scan in (sleep, car seats, strollers…), rather than the largest-first order hazards use.
 *
 * Build time only, on the same memoised load as every other page, so it costs no queries.
 * Recalls that match no type are absent here but still appear in search and on hazard pages.
 */
export async function getProductTypeGroups(): Promise<ProductTypeRecallGroup[]> {
  const details = await getRecallDetails();
  const order: string[] = PRODUCT_TYPES.map(p => p.tag);
  const groups = groupByTag(
    details.flatMap(detail => {
      const summary = toRecallSummary(detail);
      return detail.productTypes.map(({ slug }) => ({ ...summary, tag: slug }));
    }),
    productTypeLabel
  ).sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));

  // The keyword table is the only thing deciding coverage, so report it on every build:
  // a rising untyped count is the cue to tune PRODUCT_TYPES.
  const untyped = details.filter(detail => detail.productTypes.length === 0).length;
  if (details.length) {
    console.info(
      `[product-types] ${details.length - untyped}/${details.length} recalls typed; ${untyped} untyped`
    );
  }
  for (const group of groups) {
    if (group.recalls.length > PAGINATE_THRESHOLD) {
      console.warn(
        `[product-types] ${group.slug} has ${group.recalls.length} recalls — consider paginating`
      );
    }
  }
  return groups;
}
