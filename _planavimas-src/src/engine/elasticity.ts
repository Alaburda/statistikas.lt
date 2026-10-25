// Price elasticity of demand from a log–log regression per item:
//   log(qty) = a + ε·log(price) + δ·promo + τ·t + seasonality
// Seasonality enters as the item's own log seasonal index when one is given,
// otherwise as Fourier terms.
// ε is the % change in demand for a 1 % change in price. Periods without
// sales or without a price are left out.

import { tCdf, tQuantile } from "./distributions";

export interface Ols {
  coef: number[];
  se: number[];
  df: number;
  r2: number;
}

/** Ordinary least squares via the normal equations (Gauss–Jordan with partial pivoting). */
export function ols(X: number[][], y: number[]): Ols | null {
  const n = y.length;
  const k = X[0]?.length ?? 0;
  if (n <= k || k === 0) return null;
  const A: number[][] = Array.from({ length: k }, () => new Array(2 * k).fill(0));
  const Xty = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++)
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) A[a][b] += X[i][a] * X[i][b];
    }
  for (let a = 0; a < k; a++) A[a][k + a] = 1;
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-10) return null; // singular (e.g. a constant price)
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    for (let c = 0; c < 2 * k; c++) A[col][c] /= d;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (f !== 0) for (let c = 0; c < 2 * k; c++) A[r][c] -= f * A[col][c];
    }
  }
  const inv = A.map((row) => row.slice(k));
  const coef = inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));
  let sse = 0;
  let sst = 0;
  const my = y.reduce((s, v) => s + v, 0) / n;
  for (let i = 0; i < n; i++) {
    const fit = X[i].reduce((s, v, j) => s + v * coef[j], 0);
    sse += (y[i] - fit) ** 2;
    sst += (y[i] - my) ** 2;
  }
  const df = n - k;
  const s2 = sse / df;
  return {
    coef,
    se: inv.map((row, j) => Math.sqrt(Math.max(0, row[j] * s2))),
    df,
    r2: sst > 0 ? 1 - sse / sst : 0,
  };
}

export interface Elasticity {
  estimate: number;
  lower: number;
  upper: number;
  p: number;
  n: number;
  r2: number;
  /** Price range used, for the "only valid within" caveat. */
  priceMin: number;
  priceMax: number;
  /** Narrow enough to act on: 95 % CI width < 1.5 and the sign is clear (p < 0.05). */
  reliable: boolean;
}

/**
 * Estimate the price elasticity for one series. Needs ≥ 12 usable periods and
 * real price variation (max/min ≥ 1.03); otherwise null.
 */
export function priceElasticity(
  y: number[],
  price: (number | null)[],
  promo: boolean[] | null,
  m: number,
  seasonReg: number[] | null = null
): Elasticity | null {
  const idx: number[] = [];
  for (let t = 0; t < y.length; t++) if (y[t] > 0 && price[t] !== null && price[t]! > 0) idx.push(t);
  if (idx.length < 12) return null;
  const prices = idx.map((t) => price[t]!);
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  if (pMax / pMin < 1.03) return null;
  const usePromo = promo !== null && idx.some((t) => promo[t]) && idx.some((t) => !promo[t]);
  // Fourier terms only when the history spans two seasons and leaves enough df.
  const K = seasonReg ? 0 : m > 1 && y.length >= 2 * m && idx.length >= 30 ? Math.min(2, Math.floor(m / 2)) : 0;
  const X: number[][] = [];
  const Y: number[] = [];
  const n = y.length;
  for (const t of idx) {
    const row = [1, Math.log(price[t]!), t / n];
    if (usePromo) row.push(promo![t] ? 1 : 0);
    if (seasonReg) row.push(seasonReg[t]);
    for (let k = 1; k <= K; k++) {
      row.push(Math.sin((2 * Math.PI * k * t) / m), Math.cos((2 * Math.PI * k * t) / m));
    }
    X.push(row);
    Y.push(Math.log(y[t]));
  }
  const fit = ols(X, Y);
  if (!fit || fit.df < 5) return null;
  const est = fit.coef[1];
  const se = fit.se[1];
  const tq = tQuantile(0.975, fit.df);
  const tStat = se > 0 ? est / se : 0;
  const p = se > 0 ? 2 * (1 - tCdf(Math.abs(tStat), fit.df)) : 1;
  return {
    estimate: est,
    lower: est - tq * se,
    upper: est + tq * se,
    p,
    n: idx.length,
    r2: fit.r2,
    priceMin: pMin,
    priceMax: pMax,
    reliable: 2 * tq * se < 1.5 && p < 0.05,
  };
}
