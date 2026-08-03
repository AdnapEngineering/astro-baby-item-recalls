import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';

export const recalls = sqliteTable('recalls', {
  recallId: integer('recall_id').primaryKey(),
  recallNumber: text('recall_number'), // public-facing number, distinct from the API's RecallID
  title: text('title').notNull(),
  description: text('description'),
  recallDate: text('recall_date').notNull(), //ISO string
  lastPublishDate: text('last_publish_date'), // CPSC's own change marker
  url: text('url'),
  // Only the first CPSC image — recalls carry 2-10 (front/side/back views), but the first
  // is the hero shot and the rest are detail the list view has no room for.
  imageUrl: text('image_url'),
  imageCaption: text('image_caption'),
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
