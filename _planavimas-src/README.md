# Statistikas.lt Planavimas

Free, browser-only demand forecasting and S&OP tool for
**https://statistikas.lt/planavimas/**. Its job is to bring in businesses:
a useful free tool that leads to a Projektas or Partnerystė conversation
(contact links use `tema=partneryste&saltinis=planavimas-<source>`).

It mirrors the three stages of [Anofox](https://anofox.com/) (data audit →
forecast → analyse/plan), but every line is our own TypeScript. Anofox's DuckDB
extensions are BSL 1.1 and forbid offering them "to third parties on a hosted or
embedded basis", so they can't run in a public tool without a commercial licence.
DuckDB-WASM was considered and skipped: forecasting would still be custom code,
and plain TypeScript handles the data volumes fine without a multi-MB WASM download.

Everything runs client-side (forecasts in a Web Worker); the data never leaves
the page. UI is Lithuanian only.

## What it does

| Stage | Features | Code |
|-------|----------|------|
| Load | CSV (`,` `;` tab, decimal comma, UTF-8 or Windows-1257), XLSX; dates as ISO, `dd.mm.yyyy`, `yyyy-mm`, `yyyy-Www`, Excel serials; column roles guessed from headers | `data/`, `engine/periods.ts`, `engine/dataset.ts` |
| Audit | bad dates, missing quantities, returns, exact duplicates, prices, incomplete last period, gaps filled with 0, short histories, possibly discontinued items, anomalies (Hampel) | `engine/audit.ts` |
| Forecast | per item: demand class (Syntetos–Boylan), seasonality (ANOVA + strength), promotions interpolated out of the baseline, anomalies cleaned; candidates scored on up to 3 rolling holdout origins (MAE, or RMSE for intermittent demand), winner refitted on full history | `engine/pipeline.ts` |
| Models | naive, seasonal naive, moving average, AutoETS (additive-error ETS, AICc), Theta, seasonal profile, Croston, SBA, TSB, equal-weight combination | `engine/models.ts` |
| Analyse | ABC (last-year revenue or volume) × XYZ, promotion uplift, price elasticity (log–log OLS with trend, seasonality, promo; flagged unreliable when the CI is wide) | `engine/portfolio.ts`, `engine/elasticity.ts` |
| Plan | planner % adjustments, planned promotions, capacity check, safety stock / reorder point / suggested order, Excel (6 sheets) and CSV export | `engine/plan.ts`, `export/` |

Tests (`npm test`) include reference values from R's `forecast` package
(AirPassengers ETS/Theta within a few %, Croston exact, seasonal naive exact) and
an end-to-end run on the demo data.

## Development

From the site repo root:

```bash
npm --prefix _planavimas-src ci   # first time
npm run planavimas:dev            # http://localhost:5174
npm run planavimas:test
npm run planavimas:build          # type-check + build into ../planavimas/
```

## Publishing

Same as `/analize`: `quarto render` runs `scripts/build-planavimas.ts` as a
pre-render step (full renders only), which builds into `planavimas/`
(git-ignored); `project.resources` copies it to `docs/planavimas/`, and
`scripts/sitemap-analize.ts` adds the URL to the sitemap.

## Analytics

GA4 (production only), via `src/analytics.ts`. Never send data contents or names.

| Event | Params |
|-------|--------|
| `planavimas_upload` | `file_type`, `rows`, `cols` |
| `planavimas_demo` | – |
| `planavimas_forecast` | `items`, `freq`, `horizon`, `demo`, `price`, `promo` |
| `planavimas_export` | `kind` (xlsx/csv), `items` |
| `planavimas_cta_click` | `location` (topbar, cta, eksportas, footer) |

## Known limits / next steps

- Intervals assume normal errors; totals assume independent items.
- One seasonal period per frequency (weekly within days; yearly for weeks and months).
- No hierarchy reconciliation, no external regressors beyond price and promotion.
- Not yet linked from the site navigation.
