// One series in, one forecast out: clean promotions and anomalies out of the
// baseline, classify the demand, pick a model on rolling-origin holdouts,
// refit it on the full history and build prediction intervals.

import {
  type Accuracy,
  type DemandClass,
  accuracy,
  demandClass,
  seasonalProfile,
  seasonalTest,
  xyzClass,
} from "./classify";
import type { SeriesData } from "./dataset";
import { type Elasticity, priceElasticity } from "./elasticity";
import { normalQuantile } from "./distributions";
import {
  type Fit,
  type ModelId,
  MODEL_LABEL,
  autoEts,
  combine,
  croston,
  movingAverage,
  naive,
  sba,
  seasonalNaive,
  seasonalProfileModel,
  theta,
  tsb,
} from "./models";

export interface Candidate {
  model: ModelId;
  label: string;
  form: string;
  acc: Accuracy | null;
}

export interface Anomaly {
  t: number;
  value: number;
  expected: number;
}

export interface ItemResult {
  item: string;
  group: string;
  start: number;
  y: number[];
  promo: boolean[] | null;
  price: (number | null)[] | null;
  cls: DemandClass;
  adi: number;
  cv2: number;
  xyz: "X" | "Y" | "Z";
  cv: number;
  seasonal: boolean;
  seasonStrength: number;
  model: ModelId;
  modelLabel: string;
  form: string;
  /** "holdout" when chosen on the holdout, "short" when the history was too short to test. */
  selection: "holdout" | "short";
  candidates: Candidate[];
  /** The latest holdout origin of the chosen model (for the chart). */
  holdout: { from: number; actual: number[]; forecast: number[] } | null;
  /** Accuracy pooled over all holdout origins. */
  acc: Accuracy | null;
  fitted: number[];
  /** Baseline forecast (no promotions), clipped at 0. */
  forecast: number[];
  /** Standard deviation of the forecast error per horizon step. */
  sd: number[];
  promoUplift: number | null;
  promoCount: number;
  elasticity: Elasticity | null;
  anomalies: Anomaly[];
  /** Whether the anomalies were replaced before fitting. */
  cleaned: boolean;
  filled: number;
}

export interface ForecastOptions {
  horizon: number;
  /** Seasonal period m. */
  m: number;
  /** Moving-average window. */
  maWindow: number;
  /** Horizon of sd[] (≥ horizon) so lead times beyond the horizon still get a safety stock. */
  sdHorizon: number;
  /** Force one model for every item, or "auto". */
  model: ModelId | "auto";
  /** Replace detected anomalies with the local median before fitting. */
  cleanAnomalies: boolean;
}

function median(a: number[]): number {
  if (!a.length) return NaN;
  const s = a.slice().sort((x, y) => x - y);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

/**
 * Replace promotion periods with a linear interpolation of the neighbouring
 * non-promotion periods, so the baseline isn't inflated by promotion spikes.
 */
export function promoBaseline(y: number[], promo: boolean[]): number[] {
  const out = y.slice();
  const n = y.length;
  for (let t = 0; t < n; t++) {
    if (!promo[t]) continue;
    let a = t - 1;
    while (a >= 0 && promo[a]) a--;
    let b = t + 1;
    while (b < n && promo[b]) b++;
    if (a >= 0 && b < n) out[t] = y[a] + ((y[b] - y[a]) * (t - a)) / (b - a);
    else if (a >= 0) out[t] = y[a];
    else if (b < n) out[t] = y[b];
  }
  return out;
}

/**
 * Point anomalies (Hampel filter): values more than 4 local robust SDs away
 * from a rolling median. The local scale has a Poisson-like floor (√median) so
 * quiet stretches don't make every ordinary week look extreme. Promotion
 * periods are expected spikes and are skipped.
 */
export function findAnomalies(y: number[], promo: boolean[] | null, half: number): Anomaly[] {
  const n = y.length;
  if (n < 2 * half + 3) return [];
  const out: Anomaly[] = [];
  for (let t = 0; t < n; t++) {
    if (promo?.[t]) continue;
    const lo = Math.max(0, t - half);
    const hi = Math.min(n, t + half + 1);
    const win = y.slice(lo, hi);
    const med = median(win);
    const scale = Math.max(1.4826 * median(win.map((v) => Math.abs(v - med))), Math.sqrt(Math.max(med, 1)));
    const r = y[t] - med;
    if (Math.abs(r) > 4 * scale && Math.abs(r) > 0.3 * Math.max(1, med)) out.push({ t, value: y[t], expected: med });
  }
  return out;
}

function candidateModels(cls: DemandClass, seasonal: boolean): ModelId[] {
  if (cls === "sparse") return ["naive", "ma"];
  if (cls === "intermittent" || cls === "lumpy")
    return seasonal ? ["sba", "tsb", "sprofile", "snaive", "ma"] : ["croston", "sba", "tsb", "ma"];
  const list: ModelId[] = ["ets", "theta"];
  if (seasonal) list.push("sprofile", "snaive");
  list.push("ma", "naive", "combo");
  return list;
}

function fitModel(model: ModelId, y: number[], h: number, o: ForecastOptions, seasonal: boolean): Fit {
  const canSeason = seasonal && y.length >= 2 * o.m;
  switch (model) {
    case "naive":
      return naive(y, h);
    case "snaive":
      return y.length > o.m ? seasonalNaive(y, h, o.m) : naive(y, h);
    case "ma":
      return movingAverage(y, h, o.maWindow);
    case "ets":
      return autoEts(y, h, o.m, canSeason);
    case "theta":
      return theta(y, h, o.m, canSeason);
    case "croston":
      return croston(y, h);
    case "sba":
      return sba(y, h);
    case "tsb":
      return tsb(y, h);
    case "sprofile":
      return canSeason ? seasonalProfileModel(y, h, o.m) : movingAverage(y, h, o.maWindow);
    case "combo": {
      const parts = [autoEts(y, h, o.m, canSeason), theta(y, h, o.m, canSeason)];
      parts.push(canSeason ? seasonalProfileModel(y, h, o.m) : movingAverage(y, h, o.maWindow));
      return combine(parts, y);
    }
  }
}

/** Shortest training history that still gets a holdout test. */
function minTrain(seasonal: boolean, m: number): number {
  return seasonal ? 2 * m : 8;
}

export function forecastSeries(s: SeriesData, o: ForecastOptions): ItemResult {
  const y = s.y;
  const n = y.length;
  const promoCount = s.promo ? s.promo.filter(Boolean).length : 0;

  // Baseline: promotions interpolated out, then (optionally) anomalies replaced.
  let base = s.promo && promoCount > 0 ? promoBaseline(y, s.promo) : y.slice();
  const half = Math.max(3, Math.min(6, Math.round(o.m / 4)));
  const first = demandClass(base);
  const anomalies = first.cls === "smooth" || first.cls === "erratic" ? findAnomalies(base, s.promo, half) : [];
  if (o.cleanAnomalies && anomalies.length) {
    base = base.slice();
    for (const a of anomalies) base[a.t] = a.expected;
  }

  const { cls, adi, cv2 } = demandClass(base);
  const st = cls === "sparse" ? { seasonal: false, strength: 0 } : seasonalTest(base, o.m);
  const seasonal = st.seasonal;
  const { cls: xyz, cv } = xyzClass(y);

  // Rolling-origin holdout: up to 3 origins, each forecasting the next hTest periods.
  const hTest = Math.max(1, Math.min(o.horizon, Math.floor(n * 0.2)));
  const step = Math.max(1, Math.ceil(hTest / 2));
  const origins: number[] = [];
  for (let i = 0; i < 3; i++) {
    const trainLen = n - hTest - i * step;
    if (trainLen >= minTrain(seasonal, o.m) || (i === 0 && trainLen >= 8)) origins.push(trainLen);
  }
  const canTest = origins.length > 0;
  const models = o.model === "auto" ? candidateModels(cls, seasonal) : [o.model];
  const candidates: Candidate[] = [];
  let chosen: ModelId = models[0];
  let holdout: ItemResult["holdout"] = null;
  let acc: Accuracy | null = null;

  // Promotion periods are scored against the baseline (the model forecasts the baseline).
  const target = s.promo ? y.map((v, t) => (s.promo![t] ? base[t] : v)) : y;
  // Intermittent demand is ranked by RMSE: MAE is minimised by the median, which is
  // 0 for intermittent series, so it would reward forecasting no demand at all.
  const score = (a: Accuracy) => (cls === "smooth" || cls === "erratic" ? a.mae : a.rmse);
  if (canTest) {
    let bestScore = Infinity;
    for (const id of models) {
      const actualAll: number[] = [];
      const fcAll: number[] = [];
      let latest: ItemResult["holdout"] = null;
      let form = "";
      for (const trainLen of origins) {
        const f = fitModel(id, base.slice(0, trainLen), hTest, o, seasonal);
        const fc = f.forecast.map((v) => (Number.isFinite(v) ? Math.max(0, v) : 0));
        const actual = target.slice(trainLen, trainLen + hTest);
        actualAll.push(...actual);
        fcAll.push(...fc);
        if (!latest) {
          latest = { from: trainLen, actual, forecast: fc };
          form = f.form;
        }
      }
      const a = accuracy(actualAll, fcAll, base.slice(0, origins[origins.length - 1]), o.m);
      candidates.push({ model: id, label: MODEL_LABEL[id], form, acc: a });
      // Lowest pooled score wins; ties go to the model listed first.
      if (score(a) < bestScore) {
        bestScore = score(a);
        chosen = id;
        holdout = latest;
        acc = a;
      }
    }
  } else if (o.model === "auto") {
    // Too short to test: fall back to a robust default per class.
    chosen = cls === "intermittent" || cls === "lumpy" ? "sba" : n >= 4 ? "ets" : "naive";
    candidates.push({ model: chosen, label: MODEL_LABEL[chosen], form: "", acc: null });
  }

  const final = fitModel(chosen, base, Math.max(o.horizon, 1), o, seasonal);
  if (!canTest && candidates.length) candidates[0].form = final.form;
  const forecast = final.forecast.slice(0, o.horizon).map((v) => (Number.isFinite(v) ? Math.max(0, v) : 0));
  // Interval sd: prefer the out-of-sample RMSE when it is larger than the in-sample one.
  const sigma = Math.max(final.sigma, acc ? acc.rmse : 0);
  const sd: number[] = [];
  for (let j = 1; j <= Math.max(o.sdHorizon, o.horizon); j++) sd.push(sigma * final.spread(j));

  // Promotion uplift: median ratio of actual to baseline during promotions.
  let promoUplift: number | null = null;
  if (s.promo && promoCount >= 2) {
    const ratios: number[] = [];
    for (let t = 0; t < n; t++) if (s.promo[t] && base[t] > 0) ratios.push(y[t] / base[t]);
    if (ratios.length >= 2) promoUplift = Math.min(10, Math.max(0.5, median(ratios)));
  }

  // Elasticity: control for seasonality with the item's own seasonal profile.
  let seasonReg: number[] | null = null;
  if (seasonal && s.price) {
    const dec = seasonalProfile(base, o.m);
    const lvl = base.reduce((a, b) => a + b, 0) / n;
    if (dec && lvl > 0) seasonReg = base.map((_, t) => Math.log(Math.max(0.05, 1 + dec.profile[t % o.m] / lvl)));
  }
  const anomalyAt = new Set(anomalies.map((a) => a.t));
  const yForPrice = anomalyAt.size ? y.map((v, t) => (anomalyAt.has(t) ? 0 : v)) : y;
  const elasticity = s.price ? priceElasticity(yForPrice, s.price, s.promo, o.m, seasonReg) : null;

  return {
    item: s.item,
    group: s.group,
    start: s.start,
    y,
    promo: s.promo,
    price: s.price,
    cls,
    adi,
    cv2,
    xyz,
    cv,
    seasonal,
    seasonStrength: st.strength,
    model: chosen,
    modelLabel: MODEL_LABEL[chosen],
    form: final.form,
    selection: canTest ? "holdout" : "short",
    candidates,
    holdout,
    acc,
    fitted: final.fitted,
    forecast,
    sd,
    promoUplift,
    promoCount,
    elasticity,
    anomalies,
    cleaned: o.cleanAnomalies && anomalies.length > 0,
    filled: s.filled,
  };
}

/** z multiplier for a central interval of the given level (0.8 → 1.28). */
export function zFor(level: number): number {
  return normalQuantile(0.5 + level / 2);
}
