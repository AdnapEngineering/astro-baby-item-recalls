import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';

export const recalls = sqliteTable('recalls', {
  recallId: integer('recall_id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  recallDate: text('recall_date').notNull(), //ISO string
  url: text('url'),
  firstSeen: text('first_seen').notNull(),
  lastSeen: text('last_seen').notNull(),
});

export const hazards = sqliteTable(
  'hazards',
  {
    id: integer('recall_id')
      .notNull()
      .references(() => recalls.recallId),
    name: text('name').notNull(),
  },
  table => [index('hazards_name_idx').on(table.name)]
);

export type RecallRow = typeof recalls.$inferSelect;
export type HazardRow = typeof hazards.$inferSelect;
