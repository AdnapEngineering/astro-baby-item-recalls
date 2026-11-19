import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Build time only (node:fs): list rows show CPSC's hero photo in an 80px box, and the
// originals are full-size product shots. scripts/build-thumbnails.ts resizes each one into
// public/thumbs/ before the build; a row uses its thumbnail when one exists and the original
// photo otherwise, so local and fixture builds work without running that step.

export const THUMBNAIL_DIR = join(process.cwd(), 'public', 'thumbs');
/** Twice the largest box a list row draws (80px), for high-density screens. */
export const THUMBNAIL_SIZE = 160;

/** The thumbnail file name for a photo URL, or null for a URL that is not fetched (data:). */
export function thumbnailName(url: string): string | null {
  if (!/^https?:\/\//i.test(url)) return null;
  return `${createHash('sha256').update(url).digest('hex').slice(0, 20)}.webp`;
}

/** Path under the site base of this photo's thumbnail, or null if none was generated. */
export function thumbnailPath(
  url: string | null,
  dir = THUMBNAIL_DIR,
  exists: (path: string) => boolean = existsSync
): string | null {
  const name = url ? thumbnailName(url) : null;
  return name && exists(join(dir, name)) ? `/thumbs/${name}` : null;
}
