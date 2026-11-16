// GitHub Pages serves this site under a base path (`/astro-baby-item-recalls/`),
// so every internal link has to be prefixed. Centralised here so components never
// touch `import.meta.env.BASE_URL` directly.

/** Prefix a site-root-relative path with the configured base path. */
export function withBase(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return `${base}/${path.replace(/^\/+/, '')}`;
}

const strip = (value: string) => value.replace(/\/+$/, '') || '/';

/** Compare a pathname to a link href, ignoring trailing-slash differences. */
export function isActive(pathname: string, href: string) {
  return strip(pathname) === strip(href);
}

/**
 * True on the link's own page and on every page beneath it, so "Products" stays lit on
 * /products/toys/2/. The home link only matches itself, or it would match every page.
 */
export function isInSection(pathname: string, href: string) {
  const path = strip(pathname);
  const section = strip(href);
  if (isActive(path, section)) return true;
  return section !== strip(withBase('/')) && path.startsWith(`${section}/`);
}

export type NavLink = { href: string; label: string };

export const navLinks: NavLink[] = [
  { href: withBase('/'), label: 'Home' },
  { href: withBase('/recalls/'), label: 'Search' },
  { href: withBase('/products/'), label: 'Products' },
  { href: withBase('/hazards/'), label: 'Hazards' },
  { href: withBase('/about/'), label: 'About' },
];
