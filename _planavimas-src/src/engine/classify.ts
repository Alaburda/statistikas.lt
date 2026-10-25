// Series diagnostics: seasonality test, demand pattern (Syntetos–Boylan),
// portfolio ABC / XYZ classes and forecast accuracy measures.

import { fUpperP } from "./distributions";

export type DemandClass = "smooth" | "erratic" | "intermittent" | "lumpy" | "sparse";

export const DEMAND_LABEL: Record<DemandClass, string> = {
  smooth: "Tolygi",
  erratic: "Nepastovi",
  intermittent: "Pertraukiama",
  lumpy: "Gabalinė",
  sparse: "Per mažai duomenų",
};

export const DEMAND_HINT: Record<DemandClass, string> = {
  smooth: "parduodama beveik kiekvieną periodą, kiekiai panašūs",
  erratic: "parduodama beveik kiekvieną periodą, bet kiekiai labai svyruoja",
  intermittent: "dažni periodai be pardavimų, kiekiai panašūs",
  lumpy: "dažni periodai be pardavimų, o kiekiai labai svyruoja",
  sparse: "mažiau nei 3 periodai su pardavimais",
};

function mean(a: number[]): number {
  let s = 0;
  for (const v of a) s += v;
  return a.length ? s / a.length : 0;
}

/** Sample autocorrelations r_1 … r_maxLag. */
export function acf(y: number[], maxLag: number): number[] {
  const n = y.length;
  const m = mean(y);
  let c0 = 0;
  for (const v of y) c0 += (v - m) ** 2;
  const r: number[] = [];
  for (let k = 1; k <= maxLag; k++) {
    let ck = 0;
    for (let t = k; t < n; t++) ck += (y[t] - m) * (y[t - k] - m);
    r.push(c0 > 0 ? ck / c0 : 0);
  }
  return r;
}

/**
 * Seasonal profile: the average deviation from a centred moving-average trend
 * at each season position (additive, sums to 0). With weekly data (m ≥ 52) the
 * profile is smoothed over ±2 weeks, since each week has only a few years of
 * observations. Returns null without two full seasons.
 */
export function seasonalProfile(y: number[], m: number): { profile: number[]; detrended: (number | null)[] } | null {
  const n = y.length;
  if (m < 2 || n < 2 * m) return null;
  const half = Math.floor(m / 2);
  const detrended: (number | null)[] = new Array(n).fill(null);
  for (let t = half; t < n - half; t++) {
    let s = 0;
    if (m % 2 === 0) {
      s = 0.5 * y[t - half] + 0.5 * y[t + half];
      for (let i = t - half + 1; i < t + half; i++) s += y[i];
    } else for (let i = t - half; i <= t + half; i++) s += y[i];
    detrended[t] = y[t] - s / m;
  }
  const sums = new Array<number>(m).fill(0);
  const counts = new Array<number>(m).fill(0);
  detrended.forEach((d, t) => {
    if (d === null) return;
    sums[t % m] += d;
    counts[t % m]++;
  });
  let profile = sums.map((s, k) => (counts[k] ? s / counts[k] : 0));
  if (m >= 52) {
    const w = 2;
    profile = profile.map((_, k) => {
      let s = 0;
      for (let i = -w; i <= w; i++) s += profile[(k + i + m) % m];
      return s / (2 * w + 1);
    });
  }
  const pm = mean(profile);
  return { profile: profile.map((v) => v - pm), detrended };
}

/**
 * Seasonality test on the detrended series. Two conditions, so that a short
 * history of noise (few observations per season position) isn't called seasonal:
 *  - a one-way ANOVA across season positions is significant (p < 0.01), and
 *  - the strength of seasonality (Wang, Smith & Hyndman 2006),
 *    F = 1 − Var(R) / Var(S + R), is at least 0.3.
 * Needs two full seasons.
 */
export function seasonalTest(y: number[], m: number): { seasonal: boolean; strength: number } {
  const dec = seasonalProfile(y, m);
  if (!dec) return { seasonal: false, strength: 0 };
  const sr: number[] = [];
  const r: number[] = [];
  dec.detrended.forEach((d, t) => {
    if (d === null) return;
    sr.push(d);
    r.push(d - dec.profile[t % m]);
  });
  const variance = (a: number[]) => {
    const mu = mean(a);
    return a.reduce((s, v) => s + (v - mu) ** 2, 0) / Math.max(1, a.length - 1);
  };
  const vsr = variance(sr);
  const strength = vsr > 0 ? Math.max(0, 1 - variance(r) / vsr) : 0;

  // One-way ANOVA of the detrended values grouped by season position.
  const sums = new Array<number>(m).fill(0);
  const counts = new Array<number>(m).fill(0);
  dec.detrended.forEach((d, t) => {
    if (d === null) return;
    sums[t % m] += d;
    counts[t % m]++;
  });
  const N = sr.length;
  const grand = mean(sr);
  let ssb = 0;
  let ssw = 0;
  dec.detrended.forEach((d, t) => {
    if (d === null) return;
    ssw += (d - sums[t % m] / counts[t % m]) ** 2;
  });
  let groups = 0;
  for (let k = 0; k < m; k++)
    if (counts[k]) {
      ssb += counts[k] * (sums[k] / counts[k] - grand) ** 2;
      groups++;
    }
  const df1 = groups - 1;
  const df2 = N - groups;
  const p = df1 > 0 && df2 > 0 && ssw > 0 ? fUpperP(ssb / df1 / (ssw / df2), df1, df2) : 1;
  return { seasonal: p < 0.01 && strength >= 0.3, strength };
}

/**
 * Syntetos–Boylan–Croston demand classes from the average inter-demand
 * interval (ADI, cut-off 1.32) and squared CV of non-zero sizes (cut-off 0.49).
 */
export function demandClass(y: number[]): { cls: DemandClass; adi: number; cv2: number } {
  const nz = y.filter((v) => v > 0);
  if (nz.length < 3) return { cls: "sparse", adi: nz.length ? y.length / nz.length : Infinity, cv2: 0 };
  const first = y.findIndex((v) => v > 0);
  const adi = (y.length - first) / nz.length;
  const m = mean(nz);
  const sd = Math.sqrt(nz.reduce((s, v) => s + (v - m) ** 2, 0) / (nz.length - 1));
  const cv2 = (sd / m) ** 2;
  const intermittent = adi >= 1.32;
  const variable = cv2 >= 0.49;
  return {
    cls: intermittent ? (variable ? "lumpy" : "intermittent") : variable ? "erratic" : "smooth",
    adi,
    cv2,
  };
}

/** A/B/C by cumulative share of the value (80 % / 95 %), largest first. */
export function abcClasses(values: number[]): ("A" | "B" | "C")[] {
  const total = values.reduce((s, v) => s + v, 0);
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const out = new Array<"A" | "B" | "C">(values.length).fill("C");
  let cum = 0;
  for (const [v, i] of order) {
    // An item belongs to the class in which its share starts.
    const share = total > 0 ? cum / total : 1;
    out[i] = share < 0.8 ? "A" : share < 0.95 ? "B" : "C";
    cum += v;
  }
  return out;
}

/** X/Y/Z by coefficient of variation of period demand (≤ 0,5 / ≤ 1 / more). */
export function xyzClass(y: number[]): { cls: "X" | "Y" | "Z"; cv: number } {
  const m = mean(y);
  if (m <= 0) return { cls: "Z", cv: Infinity };
  const sd = Math.sqrt(y.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, y.length - 1));
  const cv = sd / m;
  return { cls: cv <= 0.5 ? "X" : cv <= 1 ? "Y" : "Z", cv };
}

export interface Accuracy {
  mae: number;
  rmse: number;
  /** Σ|e| / Σ actual. */
  wape: number;
  /** Σ(forecast − actual) / Σ actual: + over-forecast, − under-forecast. */
  bias: number;
  /** MAE relative to the in-sample (seasonal) naive MAE; < 1 beats naive. */
  mase: number;
}

export function accuracy(actual: number[], forecast: number[], train: number[], m: number): Accuracy {
  let ae = 0;
  let se = 0;
  let e = 0;
  let a = 0;
  const h = actual.length;
  for (let j = 0; j < h; j++) {
    const d = forecast[j] - actual[j];
    ae += Math.abs(d);
    se += d * d;
    e += d;
    a += Math.abs(actual[j]);
  }
  const lag = m > 1 && train.length > m * 2 ? m : 1;
  let scale = 0;
  let cnt = 0;
  for (let t = lag; t < train.length; t++) {
    scale += Math.abs(train[t] - train[t - lag]);
    cnt++;
  }
  scale = cnt ? scale / cnt : 0;
  const mae = h ? ae / h : 0;
  return {
    mae,
    rmse: h ? Math.sqrt(se / h) : 0,
    wape: a > 0 ? ae / a : ae > 0 ? Infinity : 0,
    bias: a > 0 ? e / a : 0,
    mase: scale > 0 ? mae / scale : mae > 0 ? Infinity : 0,
  };
}
