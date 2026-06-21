# SPSS Killer — Web (browser-first MVP)

A browser-first, **chunk-based** statistical analysis app. Each "chunk" runs one
statistical test on columns you pick and returns a **plain-English description, a
plot, and a results table**. The whole report exports to **Microsoft Word**.

Everything runs **client-side in the browser** — no server, no R, no API key, and
your data never leaves the page.

> This is a fresh TypeScript/React take on the concept. The R Shiny code in the
> repository root (`app.R`, `R/`) is the earlier natural-language prototype, kept
> as reference. The two are independent.

## Quick start

```bash
cd web
npm install
npm run dev        # opens http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
npm test           # run the statistics unit tests (vitest)
```

## How it works

1. The app loads with a demo medical dataset — **MASS::birthwt** (R), the
   Hosmer & Lemeshow low-birth-weight study of 189 births.
2. Four example chunks are pre-run so you can see results immediately.
3. Add a chunk → pick a **test** → pick the **column(s)** it needs → **Run**.
4. Click **Export to Word** to download a `.docx` containing every completed
   chunk (description + tables + rasterised plot).
5. **Upload CSV** to analyse your own data (column types are inferred).

## Working with your variables

The **Edit variables** panel (in the dataset bar) lets you tailor metadata
without touching the data:

- **Rename** — give any column a human-readable label (e.g. `bwt` →
  "Birth weight"). Labels flow into pickers, tables, plots, and the Word report.
- **Recode values** — for a categorical column, relabel its codes
  (`0 → No`, `1 → Yes`). Used everywhere the level appears.
- **Retype** — switch a column between numeric and categorical (handy after a
  CSV upload mis-infers a coded column).

Editing variables automatically re-runs any chunk that had already run, so
results stay in sync.

## Themes

The 🎨 picker in the top bar restyles **both tables and plots** together. Pick
from **Ocean**, **Viridis**, **Sunset**, or **Slate (print)** — the choice drives
the plot colour palette and the UI/table accents, and is carried into the Word
export so downloaded reports match what you see. Themes live in
[`src/theme.ts`](src/theme.ts).

## Tests implemented

| Test | Inputs | Output |
|------|--------|--------|
| Descriptive statistics | 1 numeric | summary table + histogram |
| Frequency table | 1 categorical | counts/percents + bar chart |
| Independent t-test (Welch) | numeric + 2-group categorical | t, df, p, 95% CI, Cohen's d + boxplot |
| One-way ANOVA | numeric + categorical | F, df, p, η² + boxplot |
| Chi-square (independence) | 2 categorical | crosstab, χ², p, Cramér's V + bar chart |
| Pearson correlation | 2 numeric | r, r², p + scatter w/ fit line |
| Linear regression | 2 numeric | coefficients, R², F + scatter w/ fit line |
| Mann–Whitney U | numeric + 2-group categorical | U, z, p + boxplot |

All p-values come from in-house implementations of the t, F, χ², and normal
distributions (incomplete beta / incomplete gamma — see
[`src/stats/distributions.ts`](src/stats/distributions.ts)). Results are checked
against R in [`src/stats/stats.test.ts`](src/stats/stats.test.ts).

## Deploying to GitHub Pages

This app is fully static, so GitHub Pages can host it. A workflow at
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) builds `web/`
and publishes it on every push to `main`.

One-time setup:

1. Push this repo to GitHub (`git init && git add -A && git commit && git push`).
2. In the repo: **Settings → Pages → Build and deployment → Source = "GitHub Actions"**.
3. Push to `main`. The workflow builds and deploys automatically.
4. Your app is live at `https://<username>.github.io/<repo>/`.

The workflow sets `VITE_BASE=/<repo>/` so assets resolve under the Pages
subpath; `vite.config.ts` reads it (defaulting to `/` for local dev). If you
later use a custom domain or a `<username>.github.io` repo, drop the `VITE_BASE`
env line so the base is `/`.

## Architecture

```
src/
  stats/
    distributions.ts   incomplete beta/gamma, t/F/chi-square/normal tails
    tests.ts           the test registry (each test: inputs + run())
    helpers.ts         column extraction, grouping, descriptive math
  charts/svg.ts        pure SVG-string charts (reused for display AND Word PNGs)
  export/word.ts       docx assembly; rasterises SVG -> PNG via canvas
  data/
    birthwt.ts         the embedded demo dataset
    csv.ts             CSV upload + type inference
  components/          React UI (ChunkCard, ResultView, Plot, DataPreview)
  App.tsx              app state: dataset + chunks
```

Adding a new test is local: implement one `TestDefinition` (an `inputs` list and
a `run(dataset, picks)` function returning a description, tables, and an optional
plot) and add it to the `TESTS` array in `src/stats/tests.ts`. The UI, Word
export, and column-pickers pick it up automatically.

## The "Word plugin" idea

The MVP ships **server-free Word export** (`docx` generated in the browser),
which is the lowest-friction path. A true **Office Add-in** is a separate, larger
effort: it's an HTML/JS task pane (this same React app can be reused) loaded
inside Word via an add-in manifest, using the Office.js API to write results into
the active document. The chunk/stats engine here is already framework-agnostic
and could be dropped into that task pane later.
