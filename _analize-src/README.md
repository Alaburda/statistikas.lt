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

It lives inside the [statistikas.lt](https://github.com/Alaburda/statistikas.lt)
site repo (it used to be the separate `web-stats` repo). The leading `_` in
`_analize-src/` keeps Quarto from rendering anything in here.

## Development

From the site repo root:

```bash
npm --prefix _analize-src ci   # first time
npm run analize:dev            # http://localhost:5173
npm run analize:test           # statistics unit tests (vitest)
npm run analize:build          # type-check + production build into ../analize/
```

(or `cd _analize-src` and use `npm run dev` / `npm test` / `npm run build`).

## Publishing

Same as the rest of the site: `quarto render`, commit, push. The site's
`_quarto.yml` runs [`scripts/build-analize.ts`](../scripts/build-analize.ts) as a
`pre-render` step on full renders; it builds this app with base `/analize/` into
`analize/` (git-ignored), which `project.resources` copies into `docs/analize/`
for GitHub Pages. Partial renders and `quarto preview` reuse the existing build.

CI ([`.github/workflows/analize.yml`](../.github/workflows/analize.yml)) runs the
tests and a build on every change under `_analize-src/`.

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
| `analize_upload` | `file_type` (csv/xlsx/sav), `rows`, `cols` |
| `analize_sav_import` | `rows`, `cols` |
| `analize_demo` | – |
| `analize_deep_link` | `dataset`, `test_id` |
| `analize_prep_step` | `step_type` (reverse/recode/compute/filter), `from` (prielaidos when added by a remedy) |
| `analize_wizard_used` | `result_test_id` |
| `analize_project_save` | – |
| `analize_project_load` | `from` (autosave, or none for a file) |
| `analize_methods_copy` | – |
| `analize_add_chunk` | – |
| `analize_test_selected` | `test_id` |
| `analize_export_word` | `chunks` |
| `analize_share_link` | – |
| `analize_cta_click` | `location` (topbar / cta / prielaidos / eksportas / guide / vedlys / footer) |

Never send dataset contents, file names or variable names.

## Look and Word output

Plots use the site palette ([`src/theme.ts`](src/theme.ts)); there is no theme
picker. The UI follows the statistikas.lt Mondrian identity (square corners, 2px
ink rules, Instrument Sans + IBM Plex Mono) — see [`src/styles.css`](src/styles.css).
Word tables are publication-style (APA / booktabs): horizontal rules only above
and below the header and at the foot of the table, no shading, no vertical lines.

## Features beyond the tests

- **Data preparation** (`src/data/prep.ts`, `PrepPanel`): an ordered, pure pipeline
  of steps – reverse-code, recode into groups, compute scale score, filter cases –
  applied to the raw data before every analysis. Each step writes a methods sentence.
  Assumption checks can offer a step as a one-click remedy (`AssumptionCheck.addPrep`).
- **SPSS import** (`src/data/sav.ts`): own reader for `.sav` (uncompressed and
  bytecode-compressed): long names, labels, value labels, user-missing values,
  encodings. Not `.zsav` or very long strings (> 255 bytes).
- **„Duomenų analizė“ paragraph** (`src/export/methods.ts`): one methods paragraph
  for the report and the on-page preview – prep steps, tests in report order,
  assumption checks, and switches made via an assumption remedy (`Chunk.switchedFrom`).
- **Saving work** (`src/project.ts`): `.statistikas` project files (JSON: data, prep
  steps, blocks) and a browser autosave for uploaded data.
- **Deep links**: `/analize/?demo=apklausa&test=cronbach` loads a demo with that test
  first; `Demo.examples` holds the picks the blog posts describe.
- **Test-picker helper** (`TestWizard`): an optional decision tree per block.

## Verified against R

`src/stats/reference.test.ts` checks every test's raw `stats` against values
computed by [`scripts/reference.R`](scripts/reference.R) with standard R functions
(to 4 decimals). The demo rows come from the app itself, so both sides use identical data.
Re-run after adding or changing a test:

```bash
npx vite-node scripts/export-datasets.ts   # demo rows -> scripts/.cache/
Rscript scripts/reference.R                # -> src/stats/reference.json (committed)
npm test
```

The survey demo (`src/data/apklausa.ts`, `public/samples/apklausa.sav`, the `.sav`
test fixtures) is generated by [`scripts/make-survey-demo.R`](scripts/make-survey-demo.R)
with a fixed seed. R packages used: haven, jsonlite, car, dunn.test.

## Architecture

```
src/
  stats/               test registry (tests.ts) + correlations, reliability, paired,
                       groups (Kruskal–Wallis, post-hoc); distributions (incl. ptukey)
  charts/svg.ts        pure SVG-string charts (display AND Word PNGs)
  export/              word.ts (docx assembly), methods.ts (methods paragraph, references)
  data/                demo datasets, CSV/XLSX/SAV import, prep pipeline
  components/          React UI (ChunkCard, PrepPanel, TestWizard, MethodsPanel, ...)
  project.ts           project file + autosave
  site.ts              SITE_URL + contactUrl()
  analytics.ts         GA4 loader + track()
  App.tsx              app state: raw dataset + prep steps + analysis blocks
scripts/               make-survey-demo.R, reference.R, export-datasets.ts
public/                mark.svg (logo), favicon.svg, samples/apklausa.sav
```

Adding a test is local: implement one `TestDefinition` (inputs + `run()`
returning description, tables, optional plot and raw `stats`, optionally `methods`,
`apa` and `guide`) and add it to `TESTS` in `src/stats/tests.ts`. The UI, Word export
and methods paragraph pick it up automatically. Then add R reference cases to
`scripts/reference.R`, a leaf in `TestWizard`, and a blog post linked from `guide`.
