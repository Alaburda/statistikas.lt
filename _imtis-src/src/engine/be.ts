// Average bioequivalence: exact TOST power via Owen's Q and the sample size search,
// following PowerTOST so that the same inputs give the same n (see reference.test.ts).

import { owensQ, pnorm, qchisq, qnorm, qt } from "./dist";

export type DesignId =
  | "2x2"
  | "parallel"
  | "paired"
  | "2x2x3"
  | "2x2x4"
  | "2x3x3"
  | "2x4x2"
  | "2x4x4"
  | "2x2x2r"
  | "3x3"
  | "3x6x3"
  | "4x4";

export interface Design {
  label: string;
  labelEn: string;
  /** Error degrees of freedom. */
  df: (n: number) => number;
  /** Subjects must be a multiple of this (sequences or groups). */
  steps: number;
  /** Design constant in sem = se * sqrt(bk / n). */
  bk: number;
  /** The same constant per sequence: sem = se * sqrt(bkni * sum(1 / n_i)). */
  bkni: number;
}

export const DESIGNS: Record<DesignId, Design> = {
  "2x2": { label: "2×2×2 kryžminis", labelEn: "2×2×2 crossover", df: (n) => n - 2, steps: 2, bk: 2, bkni: 1 / 2 },
  parallel: { label: "Dvi lygiagrečios grupės", labelEn: "Two parallel groups", df: (n) => n - 2, steps: 2, bk: 4, bkni: 1 },
  paired: { label: "Poriniai matavimai", labelEn: "Paired", df: (n) => n - 1, steps: 1, bk: 2, bkni: 2 },
  "2x2x3": { label: "2×2×3 pilnas replikatas", labelEn: "2×2×3 full replicate", df: (n) => 2 * n - 3, steps: 2, bk: 1.5, bkni: 3 / 8 },
  "2x2x4": { label: "2×2×4 pilnas replikatas", labelEn: "2×2×4 full replicate", df: (n) => 3 * n - 4, steps: 2, bk: 1, bkni: 1 / 4 },
  "2x3x3": { label: "2×3×3 dalinis replikatas", labelEn: "2×3×3 partial replicate", df: (n) => 2 * n - 3, steps: 3, bk: 1.5, bkni: 1 / 6 },
  "2x4x2": { label: "2×4×2 Balaam", labelEn: "2×4×2 Balaam", df: (n) => n - 2, steps: 4, bk: 8, bkni: 1 / 2 },
  "2x4x4": { label: "2×4×4 pilnas replikatas", labelEn: "2×4×4 full replicate", df: (n) => 3 * n - 4, steps: 4, bk: 1, bkni: 1 / 16 },
  "2x2x2r": { label: "2×2×2 kartotinis (Liu)", labelEn: "2×2×2 repeated (Liu)", df: (n) => 3 * n - 2, steps: 2, bk: 1, bkni: 1 / 4 },
  "3x3": { label: "3×3 Lotynų kvadratas", labelEn: "3×3 Latin square", df: (n) => 2 * n - 4, steps: 3, bk: 2, bkni: 2 / 9 },
  "3x6x3": { label: "3×6×3 Williams", labelEn: "3×6×3 Williams", df: (n) => 2 * n - 4, steps: 6, bk: 2, bkni: 1 / 18 },
  "4x4": { label: "4×4 Williams", labelEn: "4×4 Williams", df: (n) => 3 * n - 6, steps: 4, bk: 2, bkni: 1 / 8 },
};

export interface BeInput {
  alpha: number;
  theta0: number;
  theta1: number;
  theta2: number;
  cv: number;
  design: DesignId;
}

export const cvToSe = (cv: number) => Math.sqrt(Math.log(1 + cv * cv));

/** Subjects per sequence, as equal as possible (first sequences get the remainder). */
export function nvec(n: number, groups: number): number[] {
  const base = Math.floor(n / groups);
  const rest = n - groups * base;
  return Array.from({ length: groups }, (_, i) => base + (i < rest ? 1 : 0));
}

function tostPower(alpha: number, lt1: number, lt2: number, diff: number, sem: number, df: number): number {
  const delta1 = (diff - lt1) / sem;
  const delta2 = (diff - lt2) / sem;
  if (df > 10000) {
    const z = qnorm(1 - alpha);
    return Math.max(pnorm(-z - delta2) - pnorm(z - delta1), 0);
  }
  const t = qt(1 - alpha, df);
  const r = ((delta1 - delta2) * Math.sqrt(df)) / (2 * t);
  const b = r > 0 ? r : Infinity;
  return Math.max(owensQ(df, -t, delta2, b) - owensQ(df, t, delta1, b), 0);
}

/** Exact TOST power. n is the total, or subjects per sequence for an unbalanced study. */
export function powerTOST(input: BeInput, n: number | number[]): number {
  const { alpha, theta0, theta1, theta2, cv, design } = input;
  const d = DESIGNS[design];
  const nv = typeof n === "number" ? nvec(n, d.steps) : n;
  const total = nv.reduce((a, b) => a + b, 0);
  const df = d.df(total);
  if (df < 1 || nv.some((x) => x < 1)) return 0;
  const sem = cvToSe(cv) * Math.sqrt(d.bkni * nv.reduce((s, x) => s + 1 / x, 0));
  return tostPower(alpha, Math.log(theta1), Math.log(theta2), Math.log(theta0), sem, df);
}

/** Smallest balanced n, a multiple of the sequence count, reaching the target power. */
export function sampleNTOST(input: BeInput, target: number): { n: number; power: number } | null {
  const { alpha, theta0, theta1, theta2, cv, design } = input;
  const d = DESIGNS[design];
  if (theta0 <= theta1 || theta0 >= theta2) return null;
  let smallest = 1;
  while (d.df(smallest) < 1) smallest += 1;
  const nmin = d.steps * Math.ceil(smallest / d.steps);

  // PowerTOST's starting point: a normal approximation with an adjusted beta.
  const centre = (Math.log(theta1) + Math.log(theta2)) / 2;
  const diff = Math.log(theta0) - centre;
  const halfWidth = (Math.log(theta2) - Math.log(theta1)) / 2;
  const se = cvToSe(cv);
  const beta = 1 - target;
  const c = Math.abs(diff / halfWidth);
  const p2 = c < 0.35 ? 1 - (1 - 0.5 * Math.exp(-7.06 * c)) * beta : 1 - beta;
  const dn = diff < 0 ? diff + halfWidth : diff - halfWidth;
  const n0 = (d.bk / 2) * ((qnorm(1 - alpha) + qnorm(p2)) * ((se * Math.SQRT2) / dn)) ** 2;
  let n = Math.max(d.steps * Math.trunc(n0 / d.steps), nmin);

  let pwr = powerTOST(input, n);
  while (pwr > target && n > nmin) {
    const lower = powerTOST(input, n - d.steps);
    if (lower < target) break;
    n -= d.steps;
    pwr = lower;
  }
  let guard = 0;
  while (pwr < target) {
    n += d.steps;
    pwr = powerTOST(input, n);
    if (++guard > 100000) return null;
  }
  return { n, power: pwr };
}

/** Upper confidence limit of a CV estimated with df degrees of freedom. */
export function cvUpper(cv: number, df: number, alpha: number): number {
  return Math.sqrt(Math.exp((Math.log(1 + cv * cv) * df) / qchisq(alpha, df)) - 1);
}

/** Root of an increasing function of x on [lo, hi]. */
function bisect(f: (x: number) => number, lo: number, hi: number): number {
  const rising = f(hi) > f(lo);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0 === rising) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export interface Tolerance {
  cvMax: number;
  gmrWorst: number;
  nMin: number;
}

/** How far the plan can drift with power still above minPower (as PowerTOST's pa.ABE). */
export function tolerance(input: BeInput, n: number, minPower: number): Tolerance {
  let hi = input.cv * 2;
  while (powerTOST({ ...input, cv: hi }, n) > minPower && hi < 10) hi *= 1.5;
  const cvMax = bisect((x) => powerTOST({ ...input, cv: x }, n) - minPower, input.cv, hi);
  const edge = input.theta0 <= 1 ? input.theta1 * 1.0001 : input.theta2 / 1.0001;
  const gmrWorst = bisect((x) => powerTOST({ ...input, theta0: x }, n) - minPower, edge, input.theta0);
  const steps = DESIGNS[input.design].steps;
  let nMin = n;
  for (let m = n - 1; m >= 2 * steps; m--) {
    if (powerTOST(input, m) < minPower) break;
    nMin = m;
  }
  return { cvMax, gmrWorst, nMin };
}

/** The EMA's minimum number of evaluable subjects. */
export const EMA_MIN_SUBJECTS = 12;

/** Dosed subjects for an expected dropout share, rounded up to a balanced study. */
export function dosed(n: number, dropout: number, steps: number): number {
  return steps * Math.ceil(Math.ceil(n / (1 - dropout) - 1e-9) / steps);
}
