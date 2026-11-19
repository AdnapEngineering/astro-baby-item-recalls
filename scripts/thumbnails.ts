import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { THUMBNAIL_SIZE, thumbnailName } from '../src/lib/thumbnails';

export type ThumbnailCounts = { created: number; kept: number; failed: number; removed: number };

/**
 * Writes a small WebP into `dir` for every photo URL that does not have one yet, and removes
 * thumbnails no URL needs any more. A photo that fails to download or decode is logged and
 * skipped, never thrown: its row falls back to the original photo, and one bad CPSC image
 * must not stop the deploy.
 */
export async function buildThumbnails(
  urls: Iterable<string>,
  {
    dir,
    fetchFn = fetch,
    concurrency = 6,
    timeoutMs = 15_000,
  }: { dir: string; fetchFn?: typeof fetch; concurrency?: number; timeoutMs?: number }
): Promise<ThumbnailCounts> {
  await mkdir(dir, { recursive: true });
  const wanted = new Map<string, string>();
  for (const url of urls) {
    const name = thumbnailName(url);
    if (name) wanted.set(name, url);
  }

  const counts: ThumbnailCounts = { created: 0, kept: 0, failed: 0, removed: 0 };
  const queue = [...wanted].filter(([name]) => {
    if (!existsSync(join(dir, name))) return true;
    counts.kept++;
    return false;
  });

  async function worker() {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [name, url] = next;
      try {
        const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const image = await sharp(Buffer.from(await response.arrayBuffer()))
          .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 75 })
          .toBuffer();
        await writeFile(join(dir, name), image);
        counts.created++;
      } catch (error) {
        counts.failed++;
        console.warn(`[thumbnails] skipped ${url}: ${(error as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  for (const file of await readdir(dir)) {
    if (file.endsWith('.webp') && !wanted.has(file)) {
      await rm(join(dir, file));
      counts.removed++;
    }
  }
  return counts;
}
