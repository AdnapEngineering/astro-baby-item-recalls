/**
 * Recalls per page on the product-type and hazard listings; a longer group continues at
 * /<section>/<slug>/2/ and so on. LIST_PAGE_SIZE overrides it so the browser tests can
 * paginate their two-recall fixture.
 */
export const LIST_PAGE_SIZE = Number(process.env.LIST_PAGE_SIZE) || 50;
