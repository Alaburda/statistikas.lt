# Statistikas.lt Imties skaičiuoklė

Free sample size calculator for **https://statistikas.lt/imtis/**. Its job is to
be the best Lithuanian answer to "kiek tiriamųjų reikia?" and to lead to a
Projektas or Konsultacija conversation (contact links use
`tema=projektas&saltinis=imtis-<source>`).

Everything runs client-side in plain TypeScript. `~/repos/powr` proved the idea with
real R through webR, but its ~30 MB first load is wrong for a phone inside the
Facebook in-app browser, so the algorithms are ported here and tested against R.

## Languages

Lithuanian at `/imtis/`, English at `/imtis/en/` (`en/index.html`, with its own
title, description and hreflang links). Both load the same bundle; `src/i18n.ts`
reads `<html lang>` once, and every UI string is written in place as
`L("lietuviškai", "in English")`. The LT/EN button in the top bar is a page load
that keeps the hash, so a calculation keeps its inputs. Numbers follow the page
(`fmt*` in `format.ts`); the methods paragraphs always come in both languages and
call `lt*`/`en*` directly. The English page says Yamane where the Lithuanian one
says Paniotto (same formula), and its contact links write an email, because the
site's contact form is Lithuanian only.

## What it does

| Tab | Features | Code |
|-----|----------|------|
| Imtis apklausoms | Cochran with finite population correction, Paniotto/Yamane, share or mean, design effect on both formulas, expected share from a pilot (Wilson limit nearest 50 %), several key estimates with optional Bonferroni, margin of a finished survey, invitations from a response rate (and a warning when even a census can't reach the target), margin from answers already collected, proportional or per-group allocation, worst-case nonresponse bounds | `engine/survey.ts` |
| Imtis palyginimams | Two means, paired, two proportions (also from an odds ratio, for case-control), A/B test with duration, one-way ANOVA and ANCOVA, two-way ANOVA (main effects, interaction, with covariates), repeated measures and mixed ANOVA (time, group, group × time; ρ and ε), χ² contingency tables, McNemar (exact), correlation, linear regression (R² from zero, R² increase), logistic regression (binary or normal predictor, Demidenko with variance correction). Effects from a table of expected means or percentages, or Cohen's f / w directly. Solves n, power or smallest detectable effect. Dropout, allocation ratio, Bonferroni, rank test inflation, SD recovered from a CI, quartiles, two SDs or a pilot | `engine/compare.ts` |
| Imtis bioekvivalentiškumo tyrimams | Exact TOST power (Owen's Q) for all 12 PowerTOST designs, n or power, 80–125 and NTI limits, EMA minimum of 12, dosed subjects, tolerance as in `pa.ABE`, upper CV limit, EMA ABEL simulated in a Web Worker | `engine/be.ts`, `engine/abel.ts` |

Every result carries a one-sentence statement with an author–year citation (LT/EN, copyable,
under the number), a methods paragraph with all inputs spelled out, its references,
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
- Designs pwr does not cover use G*Power's formulas, written out in base R in
  `reference.R` (same n and power on 300+ cases), and each formula is also checked
  against a simulation of the real test at the n it gives:
  - Repeated measures (λ = f²·N·m·ε/(1−ρ), between λ = f²·N·m/(1+(m−1)ρ)): split-plot
    ANOVA by hand under compound symmetry, within 1 point. ε < 1 is G*Power's
    correction and is checked against the formula only.
  - Two-way ANOVA and ANCOVA (λ = f²·N, df2 = N − cells − covariates): `lm`, within
    1 point. ANCOVA divides f by √(1 − R²) of the covariates (Borm et al. 2007).
  - χ²: `pwr.chisq.test`. Regression R² from zero: `pwr.f2.test`.
  - McNemar: exact binomial test on the discordant pairs, power summed over their
    number; matches an independent R enumeration to 1e-9 and simulated `binom.test`.
    Power saw-tooths in n, so the reported n is the first that reaches the target.
  - Logistic regression: Demidenko (2007) Wald test with the variance correction,
    H0 variance at the overall event rate. Against simulated `glm` Wald tests the
    formula is up to 2.5 points optimistic (77.5 % instead of 80 %) in some cases.
- The G*Power settings shown for these designs have not been run in G*Power itself.

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
| `imtis_lang` | `to` (lt, en) |

## Known limits / next steps

- No mixed models, cluster randomised or multicentre trials, survival, unequal group
  sizes beyond two groups, FDA RSABE, two-stage or adaptive designs. The contact panel
  offers these as a project.
- Proportions use the normal approximation; a notice suggests Fisher's test at small n.
- Not yet linked from the site navigation.
