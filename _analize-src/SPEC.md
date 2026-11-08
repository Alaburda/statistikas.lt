# Analizė v2 — spec: a free SPSS replacement for Lithuanian theses

Status: agreed 2026-10-17 (grilling session). Owner: Paulius Alaburda.
Phase 1 (steps 0–6) implemented 2026-10-20; phase 2 (step 7) not started.

## 1. Goal

Make `/analize` the tool a Lithuanian student uses **instead of SPSS** to finish a
survey-based bachelor's or master's thesis — from raw questionnaire export to
APA tables and a written methods paragraph.

We beat SPSS on **time from data to a write-up-ready result**, not on feature
parity. Our edges: free, private (in-browser), Lithuanian, plain-language
interpretation, finished text instead of bare output.

### Audience

Lithuanian students (bachelor / master) writing a thesis, usually with a
questionnaire (Google Forms / Apklausa.lt → CSV/XLSX, or a supervisor's `.sav`).
This differs from the consulting business's primary audience (businesses) —
deliberately: the tool is the top of the funnel.

### Non-negotiable constraints

- **Client-side only.** No server, no upload; the dataset never leaves the page.
  Heavy computation, if ever needed, goes to WebAssembly (e.g. WebR), not a backend.
- **Lithuanian UI only.**
- **Free, no paywall.** The tool remains a funnel for consulting.

### Success metrics

| Metric | Role | Source |
|--------|------|--------|
| `analize_export_word` | Primary — someone finished a real analysis | GA4 |
| Consulting leads with `saltinis=analize-*` | Business check | contact form |
| Ranking for "SPSS alternatyva", "kaip atlikti {test}" | Growth channel | Search Console |

## 2. The job to win: the survey thesis

The full path must be possible without opening SPSS:

1. Load data — CSV, XLSX, **or `.sav`**
2. Prepare — set types, reverse-code items, recode into groups, compute scale scores, filter cases
3. Reliability — Cronbach's α per scale
4. Describe the sample — Table 1
5. Compare groups / correlate scales — the tests
6. Write up — APA Word tables **plus one combined „Duomenų analizė" paragraph**

## 3. Features

### 3.1 Data preparation panel („Duomenų paruošimas")

A separate panel between the data preview and the analysis blocks.

- An **ordered list of steps**; each is editable, removable and described in a
  plain sentence. All analysis blocks see the dataset *after* all steps.
- The raw dataset is never mutated; steps are re-applied as a pure pipeline
  `raw → step1 → … → stepN → derived dataset`.
- Step types (phase 1):

| Step | Parameters | Methods-text example |
|------|------------|----------------------|
| Change type | variable, numeric/categorical | – (not reported) |
| Reverse-code | variables, scale min/max | „K3 ir K7 teiginiai perkoduoti atvirkščiai (1–5)." |
| Recode into groups | variable, value/range → label map | „Amžius sugrupuotas į 18–24, 25–34, 35+." |
| Compute scale | name, items, mean/sum, min. valid items | „Skalės balas – K1–K8 vidurkis." |
| Filter cases | condition | „Analizuoti tik respondentai, kurių …; n = 184." |

- Steps are serialised in the project file (§3.5) and share link.
- The step list feeds the combined methods paragraph (§3.4).

### 3.2 `.sav` import

- Read SPSS `.sav` files in the browser: variables, variable labels, **value
  labels** (→ `Variable.valueLabels`), missing-value definitions (→ `null`),
  measurement level (→ `numeric` / `categorical`).
- First task: evaluate existing JS `.sav` readers (browser-compatible, no
  `fs`, maintained, licence). Fallback: our own reader — the format is
  documented and we only need read support for uncompressed + bytecode-compressed
  files. `.zsav` is out of scope for phase 1.
- Lazy-load the parser chunk like `xlsx` is today.
- Tests: fixture `.sav` files (written from R with `haven::write_sav`) covering
  value labels, user-missing values, strings, and Lithuanian characters.

### 3.3 New analyses

Every new test follows the existing `TestDefinition` pattern: `methods`,
`apa`, `guide`, assumption checks with `switchTo` remedies, APA tables.

**Phase 1** (in build order — see §5):

| Test | Notes |
|------|-------|
| Cronbach's α | α, standardised α, item–total r, "α if item deleted"; warn on negatively correlated items ("maybe reverse-code?" → one-click prep step) |
| Correlation matrix | Pearson or Spearman, APA matrix with stars, n per pair |
| Paired t-test | mean difference, 95 % CI, Cohen's d_z; normality of differences → switch to Wilcoxon |
| Wilcoxon signed-rank | V/W, z, p, effect size r |
| Spearman ρ | ρ, p, n; offered as switch from Pearson when assumptions fail |
| Kruskal–Wallis | H, df, p, ε²; Dunn post-hoc (Holm-adjusted) |
| Post-hoc after ANOVA | Tukey HSD (equal variances) / Games–Howell (unequal); auto-picked from Levene result |

**Phase 2** ("the more the merrier", roughly by demand): exploratory factor
analysis (KMO, Bartlett, parallel analysis, rotation), two-way ANOVA,
repeated-measures ANOVA, mediation / moderation, Fisher's exact for r×c,
then more on demand.

### 3.4 Combined „Duomenų analizė" paragraph

- One generated paragraph for the whole report, replacing per-block methods
  sentences in the Word export (blocks keep their own text in the UI).
- Contents: software + version and citation, data preparation steps (§3.1),
  each distinct test used (deduplicated, in report order), assumption-driven
  substitutions ("kai prielaidos nebuvo tenkinamos, taikytas …"),
  significance level, multiple-comparison correction.
- A ready citation for the tool itself (APA) goes into the reference list with
  the test references.

### 3.5 Saving work

- **Autosave** to `localStorage` (data + prep steps + blocks), wrapped in
  try/catch; restore prompt on return.
- **Project file** download/upload (`.statistikas`, JSON): dataset, variables,
  prep steps, blocks, app version. Durable, emailable to a supervisor,
  attachable to a consulting request. Extends the existing `ShareState`.
- Both stay local — privacy promise intact.

### 3.6 Test-picker helper button

- „Padėkite pasirinkti testą" button next to the test picker — **optional**;
  the plain test list stays the default (users generally know their test).
- 2–3 questions: goal (compare / relate / describe) → outcome type →
  paired or independent / number of groups.
- Result: selects the test, one-sentence reason, link to the matching post
  (e.g. `kaip-pasirinkti-statistini-testa`).

### 3.7 Funnel

- Existing touchpoints stay (see README).
- **Complex analyses** (EFA, mediation/moderation, repeated measures) show a
  stronger prompt: „Jei rašote baigiamąjį darbą – patikrinkime kartu", with a
  new source `saltinis=analize-sudetinga`.

### 3.8 Analytics

New GA4 events (via `track()`):

| Event | Params |
|-------|--------|
| `analize_prep_step` | `step_type` |
| `analize_sav_import` | `rows`, `cols` |
| `analize_wizard_used` | `result_test_id` |
| `analize_project_save` | – |
| `analize_project_load` | – |

`analize_upload.file_type` gains `sav`.

## 4. Cross-cutting requirements (every step)

### 4.1 Verified numbers

- `scripts/reference.R` runs every test on the fixed demo datasets with
  standard R functions (`t.test`, `wilcox.test`, `cor.test`, `psych::alpha`,
  `TukeyHSD`, `kruskal.test`, `rstatix::games_howell_test`, `dunn.test`, …)
  and writes `src/stats/reference.json`.
- Vitest compares our statistics to the reference to 4 decimal places.
  CI already runs the tests on every change under `_analize-src/`.
- R is the only reference; we do not check output against SPSS. Where a
  method has variants (Games–Howell, tie corrections, Wilcoxon exact vs.
  asymptotic), pick one, match the R function that implements it, and
  document the choice in the test's code comment.
- Re-run the R script only when adding or changing a test.

### 4.2 Survey demo dataset

- Synthetic Lithuanian questionnaire, generated in R with a fixed seed
  (`scripts/make-survey-demo.R`): ~200 respondents, demographics (lytis,
  amžius, išsilavinimas, …), two Likert scales of 6–8 items each with some
  reverse-keyed items, a pre/post measure for paired tests.
- Uses: third demo in `DEMOS`, R fixture source, blog-post screenshots.
- Also exported as `.sav` for the import tests and as a downloadable sample.

### 4.3 One blog post per test

- Each new test ships with a post (`posts/kaip-atlikti-…` / `kada-rinktis-…`)
  linked from the test's `guide`.
- Each post has an „Atlikite dabar" button linking to `/analize/` with the test
  preselected and the survey demo loaded (new deep-link parameter, e.g.
  `?demo=apklausa&test=cronbach`).
- Once phase 1 is done: a „Nemokama SPSS alternatyva" comparison page.

## 5. Build order

Each step ships with its R fixtures, blog post, GA events and funnel touch.

| # | Deliverable | Depends on |
|---|-------------|------------|
| 0 | Survey demo dataset + `reference.R` harness (fixtures for existing tests) | – |
| 1 | Data preparation panel + `.sav` import | 0 |
| 2 | Cronbach's α + correlation matrix | 1 (scales need compute/reverse) |
| 3 | Paired t-test, Wilcoxon, Spearman | 0 |
| 4 | Kruskal–Wallis + post-hoc (Tukey, Games–Howell, Dunn) | 0 |
| 5 | Combined „Duomenų analizė" paragraph + autosave + project file | 1 |
| 6 | Test-picker helper + deep links + „Nemokama SPSS alternatyva" page | 2–4 |
| 7 | Phase 2 analyses (EFA first) | 5 |

## 6. Out of scope

- Server-side computation, accounts, cloud storage
- English UI
- Paid tiers
- A full SPSS-style data editor or syntax language
- `.sav` export and `.zsav` import (phase 1)

## 6a. Implementation notes (phase 1)

- Data-type change stays in the variable editor rather than being a prep step.
- Dunn's post-hoc uses Holm (standard step-down, as R's `p.adjust`; `dunn.test`'s
  own Holm column is not monotone, so it isn't used as the reference).
- Mann–Whitney now uses the tie-corrected variance (it had none before).
- Table 1 now has a real `run()`, so it is exported to Word and counted.
- Blog posts for new tests are text-only (no executed R), with „Išbandyti“ deep links.
- The §3.7 stronger funnel prompt applies to phase 2 analyses, so it is not built yet.

## 7. Open questions

- ~~Which `.sav` reader to use~~ — own reader (`src/data/sav.ts`).
- Which method variant to implement where several exist — resolved per test in §4.1.
