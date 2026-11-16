# Astro Baby Item Recalls

A web application built with Astro that surfaces children's product recalls from the U.S. Consumer Product Safety Commission (CPSC), with search and hazard-based browsing.

This project aims to provide a user experience similar to the CPSC's SaferProducts.gov Public Search, focusing specifically on baby item recalls.

## How it works

Recall data is **not** fetched from the CPSC at page load. A scheduled ingest job pulls from the CPSC API into a [Turso](https://turso.tech) (libSQL) database, and the site is statically built from that database. This keeps pages fast and independent of CPSC API availability, at the cost of one extra moving part: **new data only reaches the site when the site is rebuilt**, which the workflows handle automatically.

```
CPSC API  ──ingest──▶  Turso  ──astro build──▶  static site  ──▶  GitHub Pages
```

The CPSC API has no usable product category field, so children's products are identified by keyword matching against the recall title, description, product names, and hazard text. That term list lives in [`src/lib/recalls.ts`](src/lib/recalls.ts) and is the main knob for tuning what the site shows.

Hazard categories are derived the same way, from the hazard paragraph, using the `HAZARD_TAGS` table in that file. Both are applied at ingest, so after changing either list, run a wide ingest once (for example `gh workflow run "Ingest recalls" -f days=200`) so recalls already stored are re-filtered and re-tagged.

Product types (cribs and sleep, car seats, strollers, feeding, bath, furniture, gear, home safety, toys, bikes and outdoor play, clothing) come from the `PRODUCT_TYPES` table in the same file, matched against the title and product names, falling back to the description. Unlike hazard tags they are **not** stored: they are derived at build time from columns every recall already has, so editing `PRODUCT_TYPES` takes effect on the next build, with no migration or re-ingest. Each build logs how many recalls matched a type (`[product-types] 301/346 recalls typed`), which is the cue to tune the table.

## Features

- **_Searchable list:_** `/recalls/` lists every stored recall, newest first, with keyword, product-type, and hazard filters that run in the browser over build-time data. The keyword search also matches manufacturer, importer, and distributor names, which often carry a brand the title leaves out. Filters sync to `?q=`, `?type=`, and `?hazard=`, so a search can be shared, and the home page's search box hands off to it.
- **_Recall detail pages:_** `/recalls/<id>/` shows everything stored for a recall — every CPSC photo in a slider, product names and model numbers, hazards, remedy and remedy options, injuries, units, where sold, contact info, and the official CPSC link.
- **_Product browsing:_** `/products/` groups recalls by the kind of item (crib, car seat, stroller…), with a page per type — the way parents look for something they own. A recall covering several kinds appears under each. Type pages show 50 recalls each and continue at `/products/<type>/2/`.
- **_Hazard browsing:_** Recalls are tagged by hazard type with a page per hazard, each row showing a thumbnail and the remedy.
- **_Latest recalls:_** The home page shows the newest stored recalls and when the data was last updated.
- **_Responsive design:_** Built with modern web standards for a good experience across devices.
- **_Fast & efficient:_** Statically built, with Astro's partial hydration for the interactive pieces.

## Technologies used

- **_Astro_** — static site builder, with **React** islands for interactive components
- **_Tailwind CSS_** + **daisyUI** — styling
- **_Turso / libSQL_** with **Drizzle ORM** — recall storage and queries
- **_Zod_** — validation of CPSC API responses
- **_CPSC Recalls API_** — the official recall data source

## Project layout

| Path                        | What lives there                                                                  |
| --------------------------- | --------------------------------------------------------------------------------- |
| `src/pages/`                | Routes — home, about, recall search/detail, product and hazard index/detail pages |
| `src/components/`           | Header/footer, the shared recall list row, and the search island                  |
| `src/db/schema.ts`          | Drizzle schema: `recalls`, `hazards`, `remedy_options`                            |
| `src/db/client.ts`          | libSQL client; reads `DATABASE_URL` / `DATABASE_AUTH_TOKEN`                       |
| `src/lib/recalls.ts`        | CPSC API parsing, child-product matching, hazard tag and product-type tables      |
| `src/lib/recall-data.ts`    | The build-time DB load every page shares (memoised per build)                     |
| `src/lib/recall-details.ts` | Pure reshaping of DB rows into page data; `hazard-groups.ts` and `search.ts` too  |
| `src/lib/product-types.ts`  | Build-time grouping of recalls by product type, with the coverage log line        |
| `src/db/migrations/`        | Hand-written SQL migrations, applied manually to an existing database             |
| `scripts/ingest.ts`         | The ingest job — fetches CPSC recalls and upserts into Turso                      |
| `scripts/fetch-recalls.ts`  | Fetches the window in 7-day chunks, retrying CPSC outages with backoff            |
| `scripts/upsert-recall.ts`  | One recall's writes, as a single atomic `db.batch`                                |
| `scripts/remove-stale.ts`   | Removes recalls CPSC has withdrawn or whose RecallID it reused for another recall |
| `e2e/`                      | Playwright + axe accessibility checks, run against a fixture database             |
| `drizzle.config.ts`         | Drizzle Kit config for generating/applying migrations                             |

## Local development

Requires Node 24+ — the version in `.nvmrc`, which CI matches (`nvm use` picks it up).

```bash
npm install
```

Create a `.env` with your database credentials:

```bash
DATABASE_URL=libsql://your-database.turso.io
DATABASE_AUTH_TOKEN=your-token
```

Both are optional locally — without `DATABASE_URL` the client falls back to a local SQLite file at `file:./data/recalls.db`. Note that this fallback is also what makes a missing credential fail confusingly in CI: the build succeeds at connecting and then finds no tables.

For an existing database, apply the files in [`src/db/migrations/`](src/db/migrations/) in order, once each, **before** deploying the code that needs them — the ingest and the build both fail against a database missing a column the schema declares. Then run a wider ingest, such as `INGEST_DAYS=200 npm run ingest`, to fill the new columns (product identifiers, the full photo list, company names) for existing recalls in that date window. Recalls outside the window keep working: they show their single stored photo.

```bash
npm run dev      # dev server
npm run build    # production build (queries the database at build time)
npm run preview  # preview the built site
npm run format   # prettier
npm run check    # astro check — type-checks .astro, .ts, and .tsx
npm test         # vitest unit tests; no database or network needed
npm run test:a11y # browser accessibility checks; builds with a temporary fixture database
```

Tests sit next to the code they cover (`*.test.ts`). The DB-facing modules are kept thin so the logic worth testing lives in pure functions; the ingest upsert is the exception, and its test runs against a throwaway SQLite file in the OS temp directory, never `DATABASE_URL`. That file's tables are generated from `src/db/schema.ts`, so the tests always run against the current schema.

Populate the database:

```bash
npm run ingest              # last 30 days
INGEST_DAYS=200 npm run ingest   # wider window, e.g. an initial backfill
```

The ingest upserts on the CPSC `recallId`, so re-running it — at any window size — refreshes existing rows rather than duplicating them. A backfill is a one-time operation; there is no reason to run a wide window twice. Each recall's row and its hazard/remedy rows are written in one transaction, so a run that fails midway leaves every recall either fully updated or untouched. The log line reports how many recalls were new versus updated. The CPSC API intermittently fails on its side while still answering 200 OK, with a single fake recall (`RecallID` 0, title "Error retrieving Recalls: …"); it fails this way consistently on larger queries (every 30-day request on 2026-10-08, while 7–21-day ones succeeded). So the ingest requests its window in 7-day chunks, treats that error record, 5xx responses, and network errors as an outage, and retries each chunk up to five times with backoff (10 s, doubling). If any chunk still fails, the whole run fails before writing anything.

`RecallID` is not a stable identity, though: CPSC has published one recall under two IDs and later reused the spare ID for an unrelated recall. After upserting, the ingest removes stored recalls that CPSC has withdrawn (dated inside the fetched window, ID no longer returned) or reassigned (ID returned with a different recall number), and logs their IDs. It skips the cleanup — with a warning on the Actions run — if CPSC returned nothing or more than 10 rows would go. As a backstop, the build shows only one row per recall number, so a duplicate never reaches the page even before the ingest removes it.

## Accessibility

The site targets WCAG 2.2 AA: keyboard-visible focus, a skip link to the main landmark, labeled search controls with a polite result-count status, responsive layouts, reduced-motion and forced-color support, and readable content without JavaScript. Product identifiers and remedy text are not visually truncated.

Run `npx playwright install chromium` once before `npm run test:a11y`. The browser suite builds representative pages with a disposable SQLite database, never production credentials. It checks axe WCAG A/AA rules and best practices at desktop and 320 CSS pixels, keyboard skip navigation and filtering, text-spacing reflow, no-JavaScript fallback, and focus in forced-color/reduced-motion mode. Deployment runs these checks before building with Turso data.

Automated checks do not establish WCAG conformance. Before releases, manually check NVDA/Firefox and VoiceOver/Safari reading order and result announcements, keyboard focus visibility and lack of traps, 200% text zoom and 400% browser zoom without clipped content, and the accuracy of CPSC-supplied photo descriptions. API content and untested browser/assistive-technology combinations can still introduce accessibility barriers.

## Deployment

The site deploys to GitHub Pages at the `site`/`base` configured in [`astro.config.mjs`](astro.config.mjs), driven by two workflows.

### `Ingest recalls` — [`.github/workflows/ingest.yml`](.github/workflows/ingest.yml)

Runs `npm run ingest` against Turso.

- **Daily** at 12:00 UTC (`0 12 * * *`)
- **Manually**, via Actions → _Ingest recalls_ → _Run workflow_, or `gh workflow run "Ingest recalls" -f days=200`

Manual runs take a `days` input (default `200`) that becomes `INGEST_DAYS`. Scheduled runs leave it empty and use the script's 30-day default — a deliberately wide margin over the 1-day gap, because CPSC sometimes publishes recalls with a backdated `RecallDate` that a tighter window would miss.

### `Deploy Astro site to GitHub Pages` — [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)

Runs the checks below, then builds and publishes. Triggered by pushes to `main`, manual dispatch, and — via `workflow_run` — the completion of `Ingest recalls`. That last trigger is what gets fresh data onto the site: the build reads Turso, so ingested rows are invisible until a rebuild.

A few things about this workflow that are easy to trip over:

- `workflow_run` fires on _any_ conclusion, so the `checks` job is guarded on `conclusion == 'success'` and the build job needs it. A failed ingest produces a deploy run that skips everything rather than republishing against a half-written database.
- The `workflows: ['Ingest recalls']` trigger matches the ingest workflow's `name:` **as a string**. Rename one without the other and the chain silently stops — no error, deploys just stop happening after ingests.
- `concurrency: pages` with `cancel-in-progress: false` queues overlapping deploys instead of racing them, so the live site is never left half-published.

### `Checks` — [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

Formatting, type check, unit tests, and the accessibility checks. Runs on every pull request, and the deploy workflow calls the same file before building, so a change is checked before it merges and again before it ships. None of it needs the database or any secret.

### Required secrets

The ingest and deploy workflows need these as **repository** secrets (Settings → Secrets and variables → Actions):

| Secret               | Value                                    |
| -------------------- | ---------------------------------------- |
| `TURSO_DATABASE_URL` | The `libsql://...` URL for your database |
| `TURSO_AUTH_TOKEN`   | A Turso auth token with write access     |

They must be repository secrets, not environment secrets. Only the `deploy` job is scoped to the `github-pages` environment; the `build` and `ingest` jobs run unscoped, so environment-scoped secrets would be invisible to exactly the two jobs that need database access.
