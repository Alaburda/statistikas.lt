// Forecasting models. Each fit returns one-step-ahead in-sample fits, a point
// forecast and a horizon-dependent spread for prediction intervals:
//   sd(j) = sigma * spread(j),  j = 1 … h
//
// ETS follows the additive-error state-space form of Hyndman et al. (2008),
// "Forecasting with Exponential Smoothing", with heuristic initial states and
// smoothing parameters chosen by minimising the one-step squared error.
// Intermittent-demand methods: Croston (1972), Syntetos & Boylan (2005, SBA),
// Teunter, Syntetos & Babai (2011, TSB). Theta: Assimakopoulos & Nikolopoulos
// (2000) in the SES-with-drift form of Hyndman & Billah (2003).

import { logistic, logit, nelderMead } from "./optim";

export type ModelId =
  | "naive"
  | "snaive"
  | "ma"
  | "ets"
  | "theta"
  | "croston"
  | "sba"
  | "tsb"
  | "sprofile"
  | "combo";

export const MODEL_LABEL: Record<ModelId, string> = {
  naive: "Naivusis",
  snaive: "Sezoninis naivusis",
  ma: "Slankusis vidurkis",
  ets: "Eksponentinis glodinimas (AutoETS)",
  theta: "Theta",
  croston: "Croston",
  sba: "Croston–SBA",
  tsb: "TSB",
  sprofile: "Sezoninis profilis",
  combo: "Modelių vidurkis",
};

export const MODEL_SHORT: Record<ModelId, string> = {
  naive: "Naivusis",
  snaive: "Sez. naivusis",
  ma: "Slank. vidurkis",
  ets: "ETS",
  theta: "Theta",
  croston: "Croston",
  sba: "SBA",
  tsb: "TSB",
  sprofile: "Sez. profilis",
  combo: "Vidurkis",
};

export interface Fit {
  model: ModelId;
  /** Human-readable form, e.g. "ETS(A,Ad,M)" or "α = 0,10". */
  form: string;
  /** One-step-ahead fitted values (NaN where the model has no fit yet). */
  fitted: number[];
  forecast: number[];
  /** In-sample RMSE of the one-step errors. */
  sigma: number;
  spread: (j: number) => number;
  /** Parameters + initial states, for AICc. */
  k: number;
}

function mean(a: number[]): number {
  let s = 0;
  for (const v of a) s += v;
  return a.length ? s / a.length : 0;
}

/** RMSE over the finite one-step errors. */
function rmse(y: number[], fitted: number[]): number {
  let s = 0;
  let n = 0;
  for (let t = 0; t < y.length; t++)
    if (Number.isFinite(fitted[t])) {
      s += (y[t] - fitted[t]) ** 2;
      n++;
    }
  return n ? Math.sqrt(s / n) : 0;
}

// ---------- Benchmarks ----------

export function naive(y: number[], h: number): Fit {
  const n = y.length;
  const fitted = y.map((_, t) => (t === 0 ? NaN : y[t - 1]));
  return {
    model: "naive",
    form: "paskutinė reikšmė",
    fitted,
    forecast: new Array(h).fill(y[n - 1]),
    sigma: rmse(y, fitted),
    spread: (j) => Math.sqrt(j),
    k: 0,
  };
}

export function seasonalNaive(y: number[], h: number, m: number): Fit {
  const n = y.length;
  const fitted = y.map((_, t) => (t < m ? NaN : y[t - m]));
  const forecast: number[] = [];
  for (let j = 1; j <= h; j++) forecast.push(y[n - m + ((j - 1) % m)]);
  return {
    model: "snaive",
    form: `prieš ${m} periodus`,
    fitted,
    forecast,
    sigma: rmse(y, fitted),
    spread: (j) => Math.sqrt(Math.floor((j - 1) / m) + 1),
    k: 0,
  };
}

export function movingAverage(y: number[], h: number, w: number): Fit {
  const n = y.length;
  const win = Math.max(1, Math.min(w, n));
  const fitted = y.map((_, t) => (t < win ? NaN : mean(y.slice(t - win, t))));
  return {
    model: "ma",
    form: `${win} periodų`,
    fitted,
    forecast: new Array(h).fill(mean(y.slice(n - win))),
    sigma: rmse(y, fitted),
    spread: (j) => Math.sqrt(1 + (j - 1) / win),
    k: 1,
  };
}

// ---------- ETS ----------

export type Trend = "N" | "A" | "Ad";
export type Season = "N" | "A" | "M";

interface EtsParams {
  alpha: number;
  beta: number;
  gamma: number;
  phi: number;
}

interface EtsInit {
  l: number;
  b: number;
  s: number[];
}

/** OLS slope of v against 0, 1, 2, … */
function slope(v: number[]): number {
  const n = v.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = mean(v);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (i - mx) * (v[i] - my);
    sxx += (i - mx) ** 2;
  }
  return sxy / sxx;
}

/** Heuristic initial states from the first one or two seasons. */
function etsInit(y: number[], trend: Trend, season: Season, m: number): EtsInit {
  if (season === "N") {
    const head = y.slice(0, Math.min(10, y.length));
    const b = trend === "N" ? 0 : slope(head);
    return { l: trend === "N" ? mean(y.slice(0, Math.min(5, y.length))) : head[0] - b, b, s: [] };
  }
  const k = Math.min(Math.floor(y.length / m), 3);
  const seasonMeans: number[] = [];
  for (let i = 0; i < k; i++) seasonMeans.push(mean(y.slice(i * m, (i + 1) * m)));
  const s: number[] = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    let acc = 0;
    for (let c = 0; c < k; c++) {
      const v = y[c * m + i];
      acc += season === "A" ? v - seasonMeans[c] : seasonMeans[c] > 0 ? v / seasonMeans[c] : 1;
    }
    s[i] = acc / k;
  }
  // Normalise: additive indices sum to 0, multiplicative average 1.
  const sm = mean(s);
  for (let i = 0; i < m; i++) s[i] = season === "A" ? s[i] - sm : sm > 0 ? s[i] / sm : 1;
  const b = trend === "N" || k < 2 ? 0 : (seasonMeans[1] - seasonMeans[0]) / m;
  return { l: seasonMeans[0] - (b * (m - 1)) / 2, b, s };
}

interface EtsRun {
  sse: number;
  fitted: number[];
  l: number;
  b: number;
  s: number[];
}

function etsRun(y: number[], trend: Trend, season: Season, m: number, p: EtsParams, init: EtsInit): EtsRun {
  let l = init.l;
  let b = init.b;
  const s = init.s.slice();
  const phi = trend === "Ad" ? p.phi : 1;
  const fitted = new Array<number>(y.length);
  let sse = 0;
  for (let t = 0; t < y.length; t++) {
    const lb = l + (trend === "N" ? 0 : phi * b);
    const si = season === "N" ? 0 : s[t % m];
    const yhat = season === "M" ? lb * si : lb + si;
    fitted[t] = yhat;
    const e = y[t] - yhat;
    sse += e * e;
    if (season === "M") {
      const sDiv = si > 1e-8 ? si : 1e-8;
      l = lb + (p.alpha * e) / sDiv;
      if (trend !== "N") b = phi * b + (p.beta * e) / sDiv;
      s[t % m] = si + (p.gamma * e) / (lb > 1e-8 ? lb : 1e-8);
    } else {
      l = lb + p.alpha * e;
      if (trend !== "N") b = phi * b + p.beta * e;
      if (season === "A") s[t % m] = si + p.gamma * e;
    }
    if (!Number.isFinite(l)) return { sse: Infinity, fitted, l, b, s };
  }
  return { sse, fitted, l, b, s };
}

function decode(z: number[], trend: Trend, season: Season): EtsParams {
  let i = 0;
  const alpha = 0.0001 + 0.9998 * logistic(z[i++]);
  const beta = trend === "N" ? 0 : alpha * logistic(z[i++]);
  const gamma = season === "N" ? 0 : (1 - alpha) * logistic(z[i++]);
  const phi = trend === "Ad" ? 0.8 + 0.18 * logistic(z[i++]) : 1;
  return { alpha, beta, gamma, phi };
}

export interface EtsFit extends Fit {
  trend: Trend;
  season: Season;
  aicc: number;
  params: EtsParams;
}

export function ets(y: number[], h: number, trend: Trend, season: Season, m: number): EtsFit {
  const n = y.length;
  const init = etsInit(y, trend, season, m);
  const z0 = [logit(0.3)];
  if (trend !== "N") z0.push(logit(0.1));
  if (season !== "N") z0.push(logit(0.1));
  if (trend === "Ad") z0.push(logit(0.9));
  const { x } = nelderMead((z) => etsRun(y, trend, season, m, decode(z, trend, season), init).sse, z0, {
    maxIter: 120 * z0.length,
    tol: 1e-7,
  });
  const p = decode(x, trend, season);
  const run = etsRun(y, trend, season, m, p, init);
  const phi = p.phi;

  const forecast: number[] = [];
  let damp = 0;
  for (let j = 1; j <= h; j++) {
    damp += trend === "Ad" ? Math.pow(phi, j) : 1;
    const lb = run.l + (trend === "N" ? 0 : damp * run.b);
    const si = season === "N" ? 0 : run.s[(n - 1 + j) % m];
    forecast.push(season === "M" ? lb * si : lb + si);
  }

  // Number of free parameters: smoothing weights + initial states (+ sigma).
  const k = z0.length + 1 + (trend === "N" ? 0 : 1) + (season === "N" ? 0 : m - 1) + 1;
  const sigma2 = run.sse / n;
  const aicc =
    n * Math.log(Math.max(sigma2, 1e-12)) + 2 * k + (n - k - 1 > 0 ? (2 * k * (k + 1)) / (n - k - 1) : Infinity);

  // Interval multipliers: var_h = σ²[1 + Σ_{j<h} c_j²], c_j = α + β·Σφ^i + γ·[j mod m = 0].
  const c: number[] = [];
  let phiSum = 0;
  for (let j = 1; j <= Math.max(h, 1) + 104; j++) {
    phiSum += trend === "Ad" ? Math.pow(phi, j) : 1;
    const cj = p.alpha + (trend === "N" ? 0 : p.beta * phiSum) + (season !== "N" && j % m === 0 ? p.gamma : 0);
    c.push(cj);
  }
  const cum: number[] = [1];
  for (let j = 1; j < c.length; j++) cum.push(cum[j - 1] + c[j - 1] ** 2);
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  return {
    model: "ets",
    form:
      `ETS(A,${trend},${season}) · α = ${fmt(p.alpha)}` +
      (trend !== "N" ? `, β = ${fmt(p.beta)}` : "") +
      (season !== "N" ? `, γ = ${fmt(p.gamma)}` : "") +
      (trend === "Ad" ? `, φ = ${fmt(p.phi)}` : ""),
    fitted: run.fitted,
    forecast,
    sigma: Math.sqrt(sigma2),
    spread: (j) => Math.sqrt(cum[Math.min(j, cum.length) - 1]),
    k,
    trend,
    season,
    aicc,
    params: p,
  };
}

/**
 * AutoETS: fit every admissible additive-error ETS form and keep the lowest AICc.
 * Seasonal forms need two full seasons; multiplicative seasons need y > 0.
 */
export function autoEts(y: number[], h: number, m: number, seasonal: boolean): EtsFit {
  const n = y.length;
  const forms: [Trend, Season][] = [["N", "N"], ["A", "N"], ["Ad", "N"]];
  if (seasonal && m > 1 && n >= 2 * m + 2) {
    forms.push(["N", "A"], ["Ad", "A"]);
    if (y.every((v) => v > 0)) forms.push(["N", "M"], ["Ad", "M"]);
  }
  let best: EtsFit | null = null;
  for (const [t, s] of forms) {
    if (t !== "N" && n < 8) continue;
    const f = ets(y, h, t, s, m);
    if (Number.isFinite(f.aicc) && (!best || f.aicc < best.aicc)) best = f;
  }
  return best ?? ets(y, h, "N", "N", m);
}

// ---------- Theta ----------

/** Classical multiplicative decomposition indices (ratio to a centred moving average). */
export function seasonalIndices(y: number[], m: number): number[] {
  const n = y.length;
  const ratios: number[][] = Array.from({ length: m }, () => []);
  const half = Math.floor(m / 2);
  for (let t = half; t < n - half; t++) {
    let ma: number;
    if (m % 2 === 0) {
      let s = 0.5 * y[t - half] + 0.5 * y[t + half];
      for (let i = t - half + 1; i < t + half; i++) s += y[i];
      ma = s / m;
    } else {
      let s = 0;
      for (let i = t - half; i <= t + half; i++) s += y[i];
      ma = s / m;
    }
    if (ma > 0) ratios[t % m].push(y[t] / ma);
  }
  const idx = ratios.map((r) => (r.length ? mean(r) : 1));
  const avg = mean(idx);
  return idx.map((v) => (avg > 0 ? v / avg : 1));
}

export function theta(y: number[], h: number, m: number, seasonal: boolean): Fit {
  const n = y.length;
  const useSeason = seasonal && m > 1 && n >= 2 * m && y.every((v) => v > 0);
  const si = useSeason ? seasonalIndices(y, m) : null;
  const x = si ? y.map((v, t) => v / si[t % m]) : y;
  const ses = ets(x, h, "N", "N", m);
  const a = ses.params.alpha;
  const b0 = slope(x);
  // One-step fitted values: SES fit plus half the drift.
  const fittedX = ses.fitted.map((f, t) => f + (b0 / 2) * (1 / a - Math.pow(1 - a, t + 1) / a));
  const lastLevel = ses.forecast[0];
  const forecast: number[] = [];
  for (let j = 1; j <= h; j++) {
    const fx = lastLevel + (b0 / 2) * (j - 1 + 1 / a - Math.pow(1 - a, n) / a);
    forecast.push(si ? fx * si[(n - 1 + j) % m] : fx);
  }
  const fitted = si ? fittedX.map((f, t) => f * si[t % m]) : fittedX;
  return {
    model: "theta",
    form: `α = ${a.toFixed(2).replace(".", ",")}` + (si ? ", sezoniškumas pašalintas" : ""),
    fitted,
    forecast,
    sigma: rmse(y, fitted),
    spread: (j) => Math.sqrt(1 + (j - 1) * a * a),
    k: 2 + (si ? m - 1 : 0),
  };
}

// ---------- Intermittent demand ----------

function crostonCore(y: number[], h: number, alpha: number, sba: boolean): Fit {
  const n = y.length;
  const first = y.findIndex((v) => v > 0);
  const fitted = new Array<number>(n).fill(NaN);
  if (first < 0) {
    return { model: sba ? "sba" : "croston", form: "nėra paklausos", fitted: y.map(() => 0), forecast: new Array(h).fill(0), sigma: 0, spread: () => 1, k: 1 };
  }
  let z = y[first];
  let p = first + 1;
  let q = 1;
  const factor = sba ? 1 - alpha / 2 : 1;
  for (let t = first + 1; t < n; t++) {
    fitted[t] = (factor * z) / p;
    if (y[t] > 0) {
      z += alpha * (y[t] - z);
      p += alpha * (q - p);
      q = 1;
    } else q++;
  }
  const f = (factor * z) / p;
  return {
    model: sba ? "sba" : "croston",
    form: `α = ${alpha.toFixed(2).replace(".", ",")}`,
    fitted,
    forecast: new Array(h).fill(f),
    sigma: rmse(y, fitted),
    spread: (j) => Math.sqrt(1 + (j - 1) * alpha * alpha),
    k: 1,
  };
}

export const croston = (y: number[], h: number, alpha = 0.1) => crostonCore(y, h, alpha, false);
export const sba = (y: number[], h: number, alpha = 0.1) => crostonCore(y, h, alpha, true);

function tsbRun(y: number[], alpha: number, beta: number) {
  const n = y.length;
  const nz = y.filter((v) => v > 0);
  let z = nz.length ? mean(nz) : 0;
  let p = nz.length / n;
  const fitted = new Array<number>(n);
  let sse = 0;
  for (let t = 0; t < n; t++) {
    fitted[t] = p * z;
    sse += (y[t] - fitted[t]) ** 2;
    if (y[t] > 0) {
      p += beta * (1 - p);
      z += alpha * (y[t] - z);
    } else p -= beta * p;
  }
  return { fitted, sse, f: p * z };
}

export function tsb(y: number[], h: number): Fit {
  const grid = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5];
  let best = { alpha: 0.1, beta: 0.1, sse: Infinity };
  for (const a of grid)
    for (const b of grid) {
      const { sse } = tsbRun(y, a, b);
      if (sse < best.sse) best = { alpha: a, beta: b, sse };
    }
  const run = tsbRun(y, best.alpha, best.beta);
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  return {
    model: "tsb",
    form: `α = ${fmt(best.alpha)}, β = ${fmt(best.beta)}`,
    fitted: run.fitted,
    forecast: new Array(h).fill(run.f),
    sigma: Math.sqrt(run.sse / y.length),
    spread: (j) => Math.sqrt(1 + (j - 1) * best.alpha * best.alpha),
    k: 2,
  };
}

// ---------- Seasonal profile ----------

/**
 * Last season's average level × the average seasonal shape of all full seasons
 * (smoothed over ±2 weeks for weekly data). Works with zeros, so it suits
 * seasonal items with intermittent demand (ice scrapers, garden hoses), where
 * Croston would forecast a flat line through the season.
 */
export function seasonalProfileModel(y: number[], h: number, m: number): Fit {
  const n = y.length;
  const k = Math.floor(n / m);
  const off = n - k * m; // align full seasons to the end of the history
  const sums = new Array<number>(m).fill(0);
  for (let t = off; t < n; t++) sums[t % m] += y[t];
  let prof = sums.map((v) => v / k);
  if (m >= 52) {
    const w = 2;
    prof = prof.map((_, i) => {
      let s = 0;
      for (let d = -w; d <= w; d++) s += prof[(i + d + m) % m];
      return s / (2 * w + 1);
    });
  }
  const pm = mean(prof);
  const idx = prof.map((v) => (pm > 0 ? v / pm : 1));
  const level = mean(y.slice(n - m));
  const fitted = y.map((_, t) => (t < m ? NaN : mean(y.slice(t - m, t)) * idx[t % m]));
  const forecast: number[] = [];
  for (let j = 1; j <= h; j++) forecast.push(level * idx[(n - 1 + j) % m]);
  return {
    model: "sprofile",
    form: `${k} sez. vidurkis`,
    fitted,
    forecast,
    sigma: rmse(y, fitted),
    spread: (j) => Math.sqrt(1 + (j - 1) / m),
    k: m,
  };
}

// ---------- Combination ----------

/** Equal-weight average of several fits (forecast combinations are hard to beat). */
export function combine(fits: Fit[], y: number[]): Fit {
  const n = y.length;
  const h = fits[0].forecast.length;
  const fitted = new Array<number>(n);
  for (let t = 0; t < n; t++) {
    const vals = fits.map((f) => f.fitted[t]);
    fitted[t] = vals.every(Number.isFinite) ? mean(vals) : NaN;
  }
  const forecast: number[] = [];
  for (let j = 0; j < h; j++) forecast.push(mean(fits.map((f) => f.forecast[j])));
  const sigmas = fits.map((f) => f.sigma);
  const sigma = rmse(y, fitted) || mean(sigmas);
  return {
    model: "combo",
    form: fits.map((f) => MODEL_SHORT[f.model]).join(" + "),
    fitted,
    forecast,
    sigma,
    spread: (j) => mean(fits.map((f) => f.spread(j))),
    k: Math.max(...fits.map((f) => f.k)),
  };
}
