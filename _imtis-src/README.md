# Statistikas.lt Imties skaičiuoklė

Free sample size calculator for **https://statistikas.lt/imtis/**. Its job is to
be the best Lithuanian answer to "kiek tiriamųjų reikia?" and to lead to a
Projektas or Konsultacija conversation (contact links use
`tema=projektas&saltinis=imtis-<source>`).

Everything runs client-side in plain TypeScript. `~/repos/powr` proved the idea with
real R through webR, but its ~30 MB first load is wrong for a phone inside the
Facebook in-app browser, so the algorithms are ported here and tested against R. UI
is Lithuanian only; the methods paragraph comes in Lithuanian and English.

## What it does

| Tab | Features | Code |
|-----|----------|------|
| Apklausa | Cochran with finite population correction, Paniotto/Yamane, share or mean, design effect, invitations from a response rate (and a warning when even a census can't reach the target), margin from answers already collected, proportional or per-group allocation, worst-case nonresponse bounds | `engine/survey.ts` |
| Palyginimas | Two means, paired, two proportions (also from an odds ratio, for case-control), A/B test with duration, one-way ANOVA, correlation. Solves n, power or smallest detectable effect. Dropout, allocation ratio, Bonferroni, rank test inflation, SD recovered from a CI, quartiles, two SDs or a pilot | `engine/compare.ts` |
| Bioekvivalentiškumas | Exact TOST power (Owen's Q) for all 12 PowerTOST designs, n or power, 80–125 and NTI limits, EMA minimum of 12, dosed subjects, tolerance as in `pa.ABE`, upper CV limit, EMA ABEL simulated in a Web Worker | `engine/be.ts`, `engine/abel.ts` |

Every result carries a methods paragraph with all inputs spelled out, its references,
R code that reproduces it, G*Power settings where they map cleanly, and a link: all
inputs live in the URL hash, nothing is stored.

## Accuracy

`scripts/reference.R` writes `src/engine/reference.json` from R 4.4, PowerTOST and pwr;
`reference.test.ts` holds the engine to it. Regenerate after changing the grids:

```bash
Rscript --vanilla _imtis-src/scripts/reference.R
```

- 486 TOST scenarios: same n, power within 1e-6.
- 236 comparisons (t tests, ANOVA, proportions, correlation): same n and power.
- Unequal proportions: Fleiss has no base R function, so the 8 cases are checked
  against a simulation of the actual test. The normal approximation errs towards too
  many subjects at small n (0.83 power at n1 = 17) and never falls short.
- 60 ABEL scenarios: power within 0.4 points, n within one sequence block. Both sides
  are simulations (100,000 runs here, as in `sampleN.scABEL`), so n can legitimately
  differ by a block near the target.

The counts quoted on the page are in `components/Verified.tsx`; `verified.test.ts`
fails if they drift from the reference data.

## Development

From the site repo root:

```bash
npm --prefix _imtis-src ci   # first time
npm run imtis:dev            # http://localhost:5175
npm run imtis:test
npm run imtis:build          # type-check + build into ../imtis/
```

## Publishing

Same as `/planavimas`: `quarto render` runs `scripts/build-imtis.ts` as a pre-render
step (full renders only), which builds into `imtis/` (git-ignored);
`project.resources` copies it to `docs/imtis/`, and `scripts/sitemap-analize.ts` adds
the URL to the sitemap.

## Analytics

GA4 (production only), via `src/analytics.ts`. Never send the numbers people type.

| Event | Params |
|-------|--------|
| `imtis_tab` | `tab` |
| `imtis_copy` | `what` (text-lt, text-en, link, r) |
| `imtis_cta_click` | `location` |

## Known limits / next steps

- No repeated measures, cluster randomised or multicentre trials, survival, regression,
  FDA RSABE, two-stage or adaptive designs. The page says so and points to a project.
- Proportions use the normal approximation; a notice suggests Fisher's test at small n.
- Not yet linked from the site navigation.
