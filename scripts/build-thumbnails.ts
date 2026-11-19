import 'dotenv/config';
import { isNotNull } from 'drizzle-orm';
import { db } from '../src/db/client';
import { recalls } from '../src/db/schema';
import { THUMBNAIL_DIR } from '../src/lib/thumbnails';
import { buildThumbnails } from './thumbnails';

// Run before `astro build` in the deploy workflow, which caches public/thumbs between runs,
// so a daily build only downloads the photos of recalls it has not seen before.
const rows = await db
  .select({ imageUrl: recalls.imageUrl })
  .from(recalls)
  .where(isNotNull(recalls.imageUrl));
const counts = await buildThumbnails(
  rows.map(row => row.imageUrl!),
  { dir: THUMBNAIL_DIR }
);
console.log(
  `[thumbnails] ${counts.created} created, ${counts.kept} kept, ` +
    `${counts.failed} skipped, ${counts.removed} removed`
);
