# Statistikas.lt Analizė

Free, browser-only statistics tool for **https://statistikas.lt/analize/**. It is
both a useful free product (Lithuanian UI, t-test / ANOVA / chi-square /
regression / logistic regression / Table 1, Word report) and a sales funnel for
the statistics consulting services at [statistikas.lt](https://statistikas.lt).

Each **analysis block** („analizės blokas") runs one statistical test on the
columns you pick and returns a plain-language description, a plot and result
tables. The whole report exports to **Word (.docx)**.

Everything runs **client-side** — no server, no R, no API key; the dataset never
leaves the page. The UI is Lithuanian only (plain strings, no i18n framework).

> The R Shiny code in the repository root (`app.R`, `R/`) is an earlier
> prototype kept as reference only. This `web/` app is the active one.

## Development

```bash
cd web
npm install
npm run dev          # http://localhost:5173
npm test             # statistics unit tests (vitest)
npm run build        # type-check + production build to dist/
npm run preview      # serve the production build
```

## Deploying to statistikas.lt

Automatic. Every push to `main` runs
[`.github/workflows/deploy-site.yml`](.github/workflows/deploy-site.yml), which
runs the tests, builds with `--base /analize/`, and commits the build into the
[statistikas.lt](https://github.com/Alaburda/statistikas.lt) repo (both
`analize/` and `docs/analize/`). GitHub Pages serves that repo's `docs/`, so the
change is live at https://statistikas.lt/analize/ a minute or two later. It can
also be run by hand from the Actions tab ("Run workflow").

One-time setup: the workflow needs a repo secret `SITE_DEPLOY_TOKEN` — a
fine-grained personal access token with **Contents: Read and write** on
`Alaburda/statistikas.lt` only.

The site's `_quarto.yml` lists `analize/**` under `project.resources`, so a
local `quarto render` of the site keeps the app in `docs/analize/`. Pull the
site repo before rendering so you have the latest deployed build.

## Funnel touchpoints

All outbound links are absolute (`src/site.ts`, `SITE_URL` + `contactUrl(source)`)
and open in a new tab (`target="_blank" rel="noopener"`) so the analysis is not
lost. Contact links go to `/kontaktai.html?tema=konsultacija&saltinis=analize-<source>`.

| Where | Source / location | Notes |
|-------|-------------------|-------|
| Header "Klausti statistiko" button | `topbar` | secondary yellow button |
| Intro panel (3 steps + privacy line) | – | collapsible, remembered in `localStorage` |
| Per test: "Plačiau: {title} →" | `guide` | shown when the test definition has `guide` |
| Per test: assumption hint | `prielaidos` | shown when any assumption check is warn/fail |
| CTA panel after the block list | `cta` | Mondrian blocks, price anchor |
| Toast after Word export | `eksportas` | dismissible, non-blocking |
| Word document footer paragraph | – | contact e-mail + app URL |
| Page footer | `footer` | Statistikas.lt · Paslaugos · Straipsniai · Susisiekti |

## Analytics

`src/analytics.ts` loads GA4 (`G-DT3Y3KGPJQ`, the same property as the main site)
**only in production builds** (`import.meta.env.PROD`). `track(event, params)`
is a no-op when gtag is absent. Events:

| Event | Params |
|-------|--------|
| `analize_upload` | `file_type` (csv/xlsx), `rows`, `cols` |
| `analize_demo` | – |
| `analize_add_chunk` | – |
| `analize_test_selected` | `test_id` |
| `analize_export_word` | `chunks` |
| `analize_share_link` | – |
| `analize_cta_click` | `location` (topbar / cta / prielaidos / eksportas / guide / footer) |

Never send dataset contents, file names or variable names.

## Themes

The theme picker restyles tables and plots together and is carried into the
Word export: **Statistikas** (default, site palette), **Viridis**, and
**Spausdinimui** (print, greyscale). See [`src/theme.ts`](src/theme.ts). The UI
follows the statistikas.lt Mondrian identity (square corners, 2px ink rules,
Instrument Sans + IBM Plex Mono) — see [`src/styles.css`](src/styles.css).

## Architecture

```
src/
  stats/               test registry (tests.ts), distributions, helpers, format
  charts/svg.ts        pure SVG-string charts (display AND Word PNGs)
  export/word.ts       docx assembly; rasterises SVG -> PNG via canvas
  data/                demo dataset, CSV/XLSX import + type inference
  components/          React UI (ChunkCard, ResultView, Funnel, ...)
  site.ts              SITE_URL + contactUrl()
  analytics.ts         GA4 loader + track()
  App.tsx              app state: dataset + analysis blocks
public/                mark.svg (logo), favicon.svg
```

Adding a test is local: implement one `TestDefinition` (inputs + `run()`
returning description, tables and optional plot, optionally `methods`, `apa` and
`guide`) and add it to `TESTS` in `src/stats/tests.ts`. The UI and Word export
pick it up automatically.
