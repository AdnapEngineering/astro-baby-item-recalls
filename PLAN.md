# Learning Plan: Leveling Up astro-baby-item-recalls

A phased roadmap for growing this site while learning core Astro concepts. Each phase is
independently shippable, builds on the last, and stays compatible with the static GitHub
Pages deployment (no SSR adapter required).

**Current state:** Astro 6 + React 19 + Tailwind 4 + daisyUI. Single page with one
`client:load` island that shows CPSC baby-product recalls (seeded at build time, refetchable
client-side). Deployed to GitHub Pages under the `/astro-baby-item-recalls/` base path.

---

## Phase 1 — Multi-page routing + site navigation

**Astro concepts:** file-based routing, shared layout composition, `Astro.url` for active
links, respecting `import.meta.env.BASE_URL` everywhere (a GitHub Pages gotcha you've
already hit once with the favicon).

- Add a `Header.astro` nav component (daisyUI navbar) rendered inside `Layout.astro`,
  plus a simple `Footer.astro` with a CPSC data attribution line.
- New pages:
  - `src/pages/about.astro` — what the site is, where the data comes from.
  - `src/pages/tips/index.astro` — safety tips listing (filled in by Phase 2).
- Highlight the active nav link by comparing against `Astro.url.pathname`.
- Add `src/pages/404.astro` (Astro picks this up automatically; GitHub Pages serves it).

**Done when:** `npm run build` passes, all pages share the nav, links work with the base
path both in `npm run dev` and in the built site (`npm run preview`).

## Phase 2 — Content collections + dynamic routes

**Astro concepts:** the Content Layer API (`src/content.config.ts`, `glob()` loader),
zod-typed frontmatter, `getCollection()`, `getStaticPaths()`, `render()` for markdown,
type-safe `CollectionEntry` props.

- Create a `tips` collection: `src/content/tips/*.md` with frontmatter
  (`title`, `description`, `pubDate`, `category`, `draft`).
- Write 4–5 short seed articles (crib safety, car seat expiration, secondhand gear,
  recall-checking habits, anchor your furniture).
- `src/pages/tips/index.astro`: list non-draft tips sorted by date, grouped or badged
  by category.
- `src/pages/tips/[slug].astro`: dynamic route via `getStaticPaths`, renders the
  markdown body inside the shared layout with Tailwind `prose`-style typography.

**Done when:** each markdown file becomes a page at `/tips/<slug>/`, frontmatter typos
fail the build (zod), and a `draft: true` tip is excluded.

## Phase 3 — View transitions + theme toggle

**Astro concepts:** `<ClientRouter />` client-side navigation, `transition:name` for
shared-element animation, `is:inline` scripts and why they're needed (FOUC), how
scripts behave across view transitions (`astro:page-load` event).

- Add `<ClientRouter />` to `Layout.astro` for smooth page-to-page navigation.
- Dark/light theme toggle in the header using daisyUI themes:
  - `is:inline` script in `<head>` reads `localStorage` and sets `data-theme` before
    first paint (no flash).
  - Toggle button persists choice; survives view transitions via `astro:page-load`.
- Give the page title a `transition:name` so it animates between routes.

**Done when:** navigating between pages doesn't full-reload, the theme persists across
navigation and reloads, and there is no flash of the wrong theme.

## Phase 4 — Smarter recalls island

**Astro concepts:** island props and hydration directives in practice
(`client:load` vs `client:visible`), keeping fetch/mapping logic framework-agnostic in
`src/lib/`, localStorage-backed UI state in an island.

- Day-range selector (7 / 30 / 90 days) as daisyUI tabs — refetches via the existing
  `buildApiUrl`/`mapRecalls` helpers.
- Client-side text filter across recall title/product.
- "Mark as reviewed" per recall card, persisted to `localStorage`, with a
  "hide reviewed" toggle — teaches hydration-safe localStorage access (read in
  `useEffect`, not during render).
- Extract the card markup into `RecallCard.tsx` to practice component decomposition.

**Done when:** switching ranges refetches, filtering is instant, reviewed state
survives a reload, and the island still seeds from build-time data with no skeleton
flash on first paint.

## Phase 5 — Static endpoints: RSS + sitemap + JSON API

**Astro concepts:** non-HTML file routes (`GET` endpoints in `src/pages/*.ts`),
official integrations, how `site` + `base` config feed into generated URLs.

- `src/pages/rss.xml.ts` using `@astrojs/rss` — feed of the tips collection.
- Add `@astrojs/sitemap` integration; link both in `<head>`.
- `src/pages/recalls.json.ts` — a build-time snapshot of the mapped recall data as a
  static JSON endpoint (shows how the island's data could be self-hosted).

**Done when:** `dist/` contains `rss.xml`, `sitemap-index.xml`, and `recalls.json`,
all with correct absolute URLs including the base path.

## Phase 6 — Typed `src/lib/` + zod-validated API response

**Astro concepts:** zod as the shared validation vocabulary across the project (the same
library backing Phase 2's collection schemas), and the difference between build-time and
client-time failure handling in a static site — a broken contract should stop the build,
but must not blank the deployed page.

- Replace the hand-written CPSC types in `src/lib/recalls.ts` with zod schemas and derive
  the types via `z.infer`, so the schema is the single source of truth.
- No `.strict()` — unknown CPSC fields are stripped, not rejected, so the build stays
  forward-compatible; only missing or wrong-typed known fields fail.
- Add a `RecallSchemaError` so callers can tell "CPSC is down" from "CPSC changed shape".
- `RecalledItems.astro` rethrows `RecallSchemaError` (fails the build) but still tolerates
  a network outage by falling back to the island's client-side fetch.
- The island validates its refetch too, but degrades to the existing error alert.

**Done when:** `npm run build` fails with a readable schema error if a field is renamed,
still succeeds when the API is unreachable, and the site behaves unchanged otherwise.

## Stretch ideas (later, pick any)

- **Astro DB or live content collections** — needs a server/adapter; good excuse to
  try a Netlify/Vercel deploy alongside GitHub Pages.
- **Server islands** (`server:defer`) — also adapter-gated; would replace the
  build-time-seed pattern with true per-request freshness.
- **Playwright smoke tests** in CI before deploy.
- **OG image generation** per tips article with `satori`.

---

## Working agreement

- One conventional commit per phase on a feature branch (`feat/learning-upgrades`),
  no pushes until Justin reviews.
- `npm run build` and `npm run format` must pass before each commit.
- Keep all fetch/transform logic in `src/lib/` so `.astro`, endpoints, and islands
  share it.
