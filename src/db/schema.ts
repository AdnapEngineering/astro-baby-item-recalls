import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export type ProductIdentifier = { name: string | null; model: string | null };
export type RecallImage = { url: string; caption: string | null };

export const recalls = sqliteTable('recalls', {
  recallId: integer('recall_id').primaryKey(),
  recallNumber: text('recall_number'), // public-facing number, distinct from the API's RecallID
  title: text('title').notNull(),
  description: text('description'),
  productIdentifiers: text('product_identifiers', { mode: 'json' })
    .$type<ProductIdentifier[]>()
    .notNull()
    .default(sql`'[]'`),
  recallDate: text('recall_date').notNull(), // CPSC's timestamp, e.g. "2026-07-30T00:00:00"
  lastPublishDate: text('last_publish_date'), // CPSC's own change marker
  url: text('url'),
  // The first CPSC image: the hero shot, and the only one the list views have room for.
  imageUrl: text('image_url'),
  imageCaption: text('image_caption'),
  // Every CPSC image in API order, the first included — recalls carry up to ten (label,
  // packaging, side and back views), which is what a parent matches against their own item.
  // Empty on rows last ingested before this column existed; fall back to imageUrl there.
  images: text('images', { mode: 'json' })
    .$type<RecallImage[]>()
    .notNull()
    .default(sql`'[]'`),
  // Manufacturer, importer and distributor names, deduplicated. Kept for search only: the
  // values are legal-notice prose ("X, Inc., doing business as X, of Chicago, Illinois"),
  // useful to match a brand against but not fit to display.
  companyNames: text('company_names', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  consumerContact: text('consumer_contact'),
  remedy: text('remedy'),
  injuries: text('injuries'), // prose, often "None reported" — not a count
  unitsText: text('units_text'), // "About 12,800", kept as text since it can carry asides
  soldAt: text('sold_at'), // where/when/price sentence from Retailers[], not a store name
  country: text('country'),
  firstSeen: text('first_seen').notNull(),
  lastSeen: text('last_seen').notNull(),
});

export const hazards = sqliteTable(
  'hazards',
  {
    recallId: integer('recall_id')
      .notNull()
      .references(() => recalls.recallId),
    name: text('name').notNull(), // the full CPSC hazard paragraph
    tag: text('tag'), // derived by hazardTag(); the indexed, filterable form
  },
  table => [index('hazards_tag_idx').on(table.tag)]
);

export const remedyOptions = sqliteTable(
  'remedy_options',
  {
    recallId: integer('recall_id')
      .notNull()
      .references(() => recalls.recallId),
    option: text('option').notNull(), // Refund | Repair | Replace
  },
  table => [index('remedy_options_option_idx').on(table.option)]
);

export type RecallRow = typeof recalls.$inferSelect;
export type HazardRow = typeof hazards.$inferSelect;
export type RemedyOptionRow = typeof remedyOptions.$inferSelect;
