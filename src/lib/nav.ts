// GitHub Pages serves this site under a base path (`/astro-baby-item-recalls/`),
// so every internal link has to be prefixed. Centralised here so components never
// touch `import.meta.env.BASE_URL` directly.

/** Prefix a site-root-relative path with the configured base path. */
export function withBase(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return `${base}/${path.replace(/^\/+/, '')}`;
}

/** Compare a pathname to a link href, ignoring trailing-slash differences. */
export function isActive(pathname: string, href: string) {
  const strip = (value: string) => value.replace(/\/+$/, '') || '/';
  return strip(pathname) === strip(href);
}

export type NavLink = { href: string; label: string };

export const navLinks: NavLink[] = [
  { href: withBase('/'), label: 'Home' },
  { href: withBase('/about/'), label: 'About' },
];
