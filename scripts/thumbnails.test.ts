import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THUMBNAIL_SIZE, thumbnailName, thumbnailPath } from '../src/lib/thumbnails';
import { buildThumbnails } from './thumbnails';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'thumbs-test-'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const png = () =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: '#888' } })
    .png()
    .toBuffer();

describe('thumbnailName and thumbnailPath', () => {
  it('names http(s) photos by a hash and ignores data: URLs', () => {
    expect(thumbnailName('https://www.cpsc.gov/a.jpg')).toMatch(/^[0-9a-f]{20}\.webp$/);
    expect(thumbnailName('https://www.cpsc.gov/a.jpg')).toBe(
      thumbnailName('https://www.cpsc.gov/a.jpg')
    );
    expect(thumbnailName('data:image/svg+xml,<svg/>')).toBeNull();
  });

  it('points to a thumbnail only when its file exists', () => {
    const url = 'https://www.cpsc.gov/a.jpg';
    expect(thumbnailPath(url, dir, () => true)).toBe(`/thumbs/${thumbnailName(url)}`);
    expect(thumbnailPath(url, dir, () => false)).toBeNull();
    expect(thumbnailPath(null, dir, () => true)).toBeNull();
  });
});

describe('buildThumbnails', () => {
  it('resizes new photos, keeps existing ones, and removes unused ones', async () => {
    const body = await png();
    const fetchFn = vi.fn(async () => new Response(body)) as unknown as typeof fetch;
    const kept = 'https://www.cpsc.gov/kept.jpg';
    writeFileSync(join(dir, thumbnailName(kept)!), 'old');
    writeFileSync(join(dir, 'orphan.webp'), 'old');

    const counts = await buildThumbnails(['https://www.cpsc.gov/new.jpg', kept, 'data:x'], {
      dir,
      fetchFn,
    });

    expect(counts).toEqual({ created: 1, kept: 1, failed: 0, removed: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const created = join(dir, thumbnailName('https://www.cpsc.gov/new.jpg')!);
    const meta = await sharp(created).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(THUMBNAIL_SIZE);
    expect(existsSync(join(dir, 'orphan.webp'))).toBe(false);
  });

  it('skips photos that fail to download or decode instead of throwing', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('404.jpg') ? new Response('', { status: 404 }) : new Response('not an image')
    ) as unknown as typeof fetch;

    const counts = await buildThumbnails(
      ['https://www.cpsc.gov/404.jpg', 'https://www.cpsc.gov/broken.jpg'],
      { dir, fetchFn }
    );

    expect(counts).toEqual({ created: 0, kept: 0, failed: 2, removed: 0 });
    expect(readdirSync(dir)).toEqual([]);
  });
});
