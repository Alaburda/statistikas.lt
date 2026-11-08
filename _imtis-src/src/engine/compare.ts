// Power and sample size for comparing groups. Each design defines power(n); solving
// for n or for the smallest detectable effect is generic search on top of that.

import { logGamma, pbeta, pnchisq, pnct, pnf, pnorm, pt, qchisq, qfUpper, qnorm, qt } from "./dist";

export type RmEffect = "within" | "between" | "inter";
export type FactorialEffect = "A" | "B" | "AB";

export type Spec =
  | { kind: "means"; delta: number; sd: number; ratio: number }
  | { kind: "paired"; delta: number; sdDiff: number }
  /** fixed: which share is known; the other one moves when the effect changes. */
  | { kind: "props"; p1: number; p2: number; ratio: number; fixed?: "p1" | "p2" }
  /** covariates > 0 makes it an ANCOVA; f is then already adjusted for them. */
  | { kind: "anova"; groups: number; f: number; covariates?: number }
  /** a × b cells (rows × columns), n per cell; one effect is tested. */
  | { kind: "factorial"; a: number; b: number; effect: FactorialEffect; f: number; covariates?: number }
  /** groups × times, n per group; rho between measurements, eps the sphericity correction. */
  | { kind: "rm"; groups: number; times: number; effect: RmEffect; f: number; rho: number; eps: number }
  | { kind: "corr"; r: number }
  /** Linear regression: tested of predictors are tested; r2Base is the R² without them. */
  | { kind: "reg"; predictors: number; tested: number; r2Base: number; r2Gain: number }
  /** Logistic regression, one predictor tested; p0 at x = 0 (binary) or at the mean (normal, per SD). */
  | { kind: "logit"; x: "binary" | "normal"; p0: number; or: number; share: number; r2: number }
  /** Contingency table (rows = 1: goodness of fit), Cohen's w. */
  | { kind: "chisq"; rows: number; cols: number; w: number }
  /** McNemar: share with "yes" at the first and second measurement, share who change. */
  | { kind: "mcnemar"; p1: number; p2: number; disc: number };

export interface Test {
  alpha: number;
  sides: 1 | 2;
}

/** Group sizes for a given base n (n1 for two groups, per group or cell for ANOVA, else total). */
export function sizes(spec: Spec, n: number): number[] {
  switch (spec.kind) {
    case "means":
    case "props":
      return [n, Math.ceil(n * spec.ratio - 1e-9)];
    case "anova":
    case "rm":
      return Array.from({ length: spec.groups }, () => n);
    case "factorial":
      return Array.from({ length: spec.a * spec.b }, () => n);
    default:
      return [n];
  }
}

export function minN(spec: Spec): number {
  switch (spec.kind) {
    case "corr":
      return 4;
    case "reg":
      return spec.predictors + 2;
    case "logit":
      return 10;
    default:
      return 2;
  }
}

function tPower(ncp: number, df: number, { alpha, sides }: Test): number {
  const q = qt(1 - alpha / sides, df);
  const upper = 1 - pnct(q, df, ncp);
  return sides === 2 ? upper + pnct(-q, df, ncp) : upper;
}

/** Power of an F test with non-centrality lambda; df may be fractional (sphericity correction). */
function fPower(lambda: number, df1: number, df2: number, alpha: number): number {
  if (!(df2 > 0) || !(df1 > 0)) return 0;
  return 1 - pnf(qfUpper(alpha, df1, df2), df1, df2, lambda);
}

export const factorialDf = (spec: Extract<Spec, { kind: "factorial" }>) =>
  spec.effect === "A" ? spec.a - 1 : spec.effect === "B" ? spec.b - 1 : (spec.a - 1) * (spec.b - 1);

/** Numerator and denominator df and non-centrality of a repeated measures effect (as G*Power). */
export function rmTerms(spec: Extract<Spec, { kind: "rm" }>, n: number): { df1: number; df2: number; lambda: number } {
  const N = spec.groups * n;
  const m = spec.times;
  const f2 = spec.f * spec.f;
  if (spec.effect === "between") return { df1: spec.groups - 1, df2: N - spec.groups, lambda: (f2 * N * m) / (1 + (m - 1) * spec.rho) };
  const df1 = (spec.effect === "within" ? m - 1 : (spec.groups - 1) * (m - 1)) * spec.eps;
  return { df1, df2: (N - spec.groups) * (m - 1) * spec.eps, lambda: (f2 * N * m * spec.eps) / (1 - spec.rho) };
}

export const regF2 = (spec: Extract<Spec, { kind: "reg" }>) => spec.r2Gain / (1 - spec.r2Base - spec.r2Gain);
export const chisqDf = (spec: Extract<Spec, { kind: "chisq" }>) => (spec.rows === 1 ? spec.cols - 1 : (spec.rows - 1) * (spec.cols - 1));

export function power(spec: Spec, test: Test, n: number): number {
  switch (spec.kind) {
    case "means": {
      const n2 = Math.ceil(n * spec.ratio - 1e-9);
      const d = spec.delta / spec.sd;
      return tPower(Math.abs(d) * Math.sqrt((n * n2) / (n + n2)), n + n2 - 2, test);
    }
    case "paired":
      return tPower((Math.abs(spec.delta) / spec.sdDiff) * Math.sqrt(n), n - 1, test);
    case "props":
      return propsPower(spec.p1, spec.p2, spec.ratio, n, test);
    case "anova":
      return fPower(spec.groups * n * spec.f * spec.f, spec.groups - 1, spec.groups * (n - 1) - (spec.covariates ?? 0), test.alpha);
    case "factorial": {
      const cells = spec.a * spec.b;
      const N = cells * n;
      return fPower(spec.f * spec.f * N, factorialDf(spec), N - cells - (spec.covariates ?? 0), test.alpha);
    }
    case "rm": {
      const { df1, df2, lambda } = rmTerms(spec, n);
      return fPower(lambda, df1, df2, test.alpha);
    }
    case "corr":
      return corrPower(spec.r, n, test);
    case "reg":
      return fPower(regF2(spec) * n, spec.tested, n - spec.predictors - 1, test.alpha);
    case "logit":
      return logitPower(spec, n, test);
    case "chisq": {
      const df = chisqDf(spec);
      return 1 - pnchisq(qchisq(1 - test.alpha, df), df, spec.w * spec.w * n);
    }
    case "mcnemar":
      return mcnemarPower(spec, n, test);
  }
}

/** Normal approximation with the pooled variance under H0 (Fleiss), as power.prop.test. */
function propsPower(p1: number, p2: number, ratio: number, n: number, { alpha, sides }: Test): number {
  const k = ratio === 1 ? 1 : Math.ceil(n * ratio - 1e-9) / n;
  const diff = Math.abs(p1 - p2);
  const pbar = (p1 + k * p2) / (1 + k);
  const null_ = qnorm(1 - alpha / sides) * Math.sqrt((1 + 1 / k) * pbar * (1 - pbar));
  const alt = Math.sqrt(p1 * (1 - p1) + (p2 * (1 - p2)) / k);
  return pnorm((diff * Math.sqrt(n) - null_) / alt);
}

/** Same approximation as pwr.r.test. */
function corrPower(r: number, n: number, { alpha, sides }: Test): number {
  const t = qt(1 - alpha / sides, n - 2);
  const rc = Math.sqrt((t * t) / (t * t + n - 2));
  const a = Math.abs(r);
  const zr = Math.atanh(a) + a / (2 * (n - 1));
  const zrc = Math.atanh(rc);
  const upper = pnorm((zr - zrc) * Math.sqrt(n - 3));
  return sides === 2 ? upper + pnorm((-zr - zrc) * Math.sqrt(n - 3)) : upper;
}

// ---- Logistic regression: Demidenko (2007), Wald test with variance correction ----

const expit = (z: number) => 1 / (1 + Math.exp(-z));
const logit = (p: number) => Math.log(p / (1 - p));

/** Standard normal nodes for E[g(X)], X ~ N(0, 1): composite Simpson on ±9 SD. */
const SIMPSON = (() => {
  const k = 720;
  const h = 18 / k;
  const xs: number[] = [];
  const ws: number[] = [];
  for (let i = 0; i <= k; i++) {
    const x = -9 + i * h;
    xs.push(x);
    ws.push(((i === 0 || i === k ? 1 : i % 2 ? 4 : 2) * h * Math.exp(-x * x / 2)) / (3 * Math.sqrt(2 * Math.PI)));
  }
  return { xs, ws };
})();

/** Per-observation variances of the slope estimate under H0 and H1. */
export function logitVariances(spec: Extract<Spec, { kind: "logit" }>): { v0: number; v1: number; beta: number } {
  const b0 = logit(spec.p0);
  const b1 = Math.log(spec.or);
  const w = (x: number) => {
    const p = expit(b0 + b1 * x);
    return p * (1 - p);
  };
  let i00 = 0;
  let i01 = 0;
  let i11 = 0;
  let varX: number;
  // The overall event rate: under H0 the slope is 0 and every person has this probability.
  let pbar = 0;
  if (spec.x === "binary") {
    const B = spec.share;
    i00 = (1 - B) * w(0) + B * w(1);
    i01 = i11 = B * w(1);
    varX = B * (1 - B);
    pbar = (1 - B) * spec.p0 + B * expit(b0 + b1);
  } else {
    const { xs, ws } = SIMPSON;
    for (let i = 0; i < xs.length; i++) {
      const v = ws[i] * w(xs[i]);
      i00 += v;
      i01 += v * xs[i];
      i11 += v * xs[i] * xs[i];
      pbar += ws[i] * expit(b0 + b1 * xs[i]);
    }
    varX = 1;
  }
  const v1 = i00 / (i00 * i11 - i01 * i01);
  const v0 = 1 / (pbar * (1 - pbar) * varX);
  return { v0, v1, beta: b1 };
}

function logitPower(spec: Extract<Spec, { kind: "logit" }>, n: number, { alpha, sides }: Test): number {
  const { v0, v1, beta } = logitVariances(spec);
  const root = Math.sqrt(n * (1 - spec.r2));
  const z = qnorm(1 - alpha / sides);
  const b = Math.abs(beta);
  const upper = pnorm((b * root - z * Math.sqrt(v0)) / Math.sqrt(v1));
  return sides === 2 ? upper + pnorm((-b * root - z * Math.sqrt(v0)) / Math.sqrt(v1)) : upper;
}

// ---- McNemar: exact conditional test, unconditional power over the discordant pairs ----

/** P(X <= k), X ~ Binomial(d, p). */
function pbinom(k: number, d: number, p: number): number {
  if (k < 0) return 0;
  if (k >= d) return 1;
  return pbeta(1 - p, d - k, k + 1);
}

/** Critical values depend only on d and alpha, and the same ones recur across every n. */
const CRITICAL = new Map<string, number>();

/** Largest c with P(X <= c) <= a under p = 1/2; -1 when even X = 0 is too likely. */
function criticalLow(d: number, a: number): number {
  const key = `${d}|${a}`;
  const cached = CRITICAL.get(key);
  if (cached !== undefined) return cached;
  let c = Math.max(-1, Math.floor(d / 2 - (qnorm(1 - a) * Math.sqrt(d)) / 2));
  while (c >= 0 && pbinom(c, d, 0.5) > a) c--;
  while (c + 1 < d && pbinom(c + 1, d, 0.5) <= a) c++;
  if (CRITICAL.size > 200_000) CRITICAL.clear();
  CRITICAL.set(key, c);
  return c;
}

/** The two discordant cells: yes → no and no → yes. */
export const mcnemarCells = (s: Extract<Spec, { kind: "mcnemar" }>) => ({
  yesNo: (s.disc + (s.p1 - s.p2)) / 2,
  noYes: (s.disc - (s.p1 - s.p2)) / 2,
});

function mcnemarPower(spec: Extract<Spec, { kind: "mcnemar" }>, n: number, { alpha, sides }: Test): number {
  const disc = Math.min(spec.disc, 1);
  const pi = (disc + Math.abs(spec.p1 - spec.p2)) / (2 * disc);
  const a = alpha / sides;
  const mean = n * disc;
  const sd = Math.sqrt(n * disc * (1 - disc));
  const lo = Math.max(1, Math.floor(mean - 8 * sd - 1));
  const hi = Math.min(n, Math.ceil(mean + 8 * sd + 1));
  const lnC = logGamma(n + 1);
  let total = 0;
  for (let d = lo; d <= hi; d++) {
    const weight = disc >= 1 ? (d === n ? 1 : 0) : Math.exp(lnC - logGamma(d + 1) - logGamma(n - d + 1) + d * Math.log(disc) + (n - d) * Math.log1p(-disc));
    if (weight < 1e-300) continue;
    const c = criticalLow(d, a);
    if (c < 0) continue;
    // Reject when the larger discordant cell has at least d - c pairs (and, two-sided, at most c).
    let reject = 1 - pbinom(d - c - 1, d, pi);
    if (sides === 2) reject += pbinom(c, d, pi);
    total += weight * reject;
  }
  return Math.min(total, 1);
}

/** Connor (1987): the normal approximation, used as the starting point of the exact search. */
export function mcnemarApprox(spec: Extract<Spec, { kind: "mcnemar" }>, test: Test, target: number): number {
  const delta = Math.abs(spec.p1 - spec.p2);
  const za = qnorm(1 - test.alpha / test.sides);
  const zb = qnorm(target);
  return Math.ceil((za * Math.sqrt(spec.disc) + zb * Math.sqrt(spec.disc - delta * delta)) ** 2 / (delta * delta));
}

const MAX_N = 50_000_000;

/** Smallest whole n reaching the target power; null when no realistic n does. */
export function solveN(spec: Spec, test: Test, target: number): number | null {
  if (spec.kind === "mcnemar") return solveMcNemar(spec, test, target);
  let lo = minN(spec) - 1;
  let hi = minN(spec);
  while (power(spec, test, hi) < target) {
    lo = hi;
    hi *= 2;
    if (hi > MAX_N) return null;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (power(spec, test, mid) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Exact power saw-tooths in n: bisection finds where it crosses the target, then a
 * short walk below that point finds the first n that already reaches it.
 */
function solveMcNemar(spec: Extract<Spec, { kind: "mcnemar" }>, test: Test, target: number): number | null {
  const approx = mcnemarApprox(spec, test, target);
  if (!Number.isFinite(approx) || approx > 200_000) return null;
  let lo = Math.max(1, Math.floor(approx * 0.7));
  while (lo > 1 && power(spec, test, lo) >= target) lo = Math.max(1, Math.floor(lo * 0.7));
  let hi = Math.max(lo + 1, approx);
  while (power(spec, test, hi) < target) {
    lo = hi;
    hi *= 2;
    if (hi > 1_000_000) return null;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (power(spec, test, mid) >= target) hi = mid;
    else lo = mid;
  }
  const from = Math.max(2, Math.floor(hi * 0.97) - 10);
  for (let n = from; n < hi; n++) if (power(spec, test, n) >= target) return n;
  return hi;
}

/** The two shares when the difference between them is e. */
export function propsAt(spec: Extract<Spec, { kind: "props" }>, e: number): { p1: number; p2: number } {
  if (spec.fixed === "p2") return { p1: spec.p1 >= spec.p2 ? spec.p2 + e : spec.p2 - e, p2: spec.p2 };
  return { p1: spec.p1, p2: spec.p2 >= spec.p1 ? spec.p1 + e : spec.p1 - e };
}

/** The spec with its effect replaced by a magnitude in the design's own unit. */
export function withEffect(spec: Spec, e: number): Spec {
  switch (spec.kind) {
    case "means":
    case "paired":
      return { ...spec, delta: e };
    case "props":
      return { ...spec, ...propsAt(spec, e) };
    case "anova":
    case "factorial":
    case "rm":
      return { ...spec, f: e };
    case "corr":
      return { ...spec, r: e };
    case "reg":
      return { ...spec, r2Gain: e };
    case "logit":
      return { ...spec, or: Math.exp(spec.or >= 1 ? e : -e) };
    case "chisq":
      return { ...spec, w: e };
    case "mcnemar":
      return { ...spec, p2: spec.p2 <= spec.p1 ? spec.p1 - e : spec.p1 + e };
  }
}

export function effectOf(spec: Spec): number {
  switch (spec.kind) {
    case "means":
    case "paired":
      return Math.abs(spec.delta);
    case "props":
      return Math.abs(spec.p2 - spec.p1);
    case "anova":
    case "factorial":
    case "rm":
      return spec.f;
    case "corr":
      return Math.abs(spec.r);
    case "reg":
      return spec.r2Gain;
    case "logit":
      return Math.abs(Math.log(spec.or));
    case "chisq":
      return spec.w;
    case "mcnemar":
      return Math.abs(spec.p1 - spec.p2);
  }
}

/** Whether an effect of this size still describes a possible study. */
export function effectPossible(spec: Spec, e: number): boolean {
  switch (spec.kind) {
    case "props": {
      const { p1, p2 } = propsAt(spec, e);
      return p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1;
    }
    case "corr":
      return e < 1;
    case "reg":
      return e < 1 - spec.r2Base;
    case "mcnemar":
      return mcnemarValid(withEffect(spec, e) as Extract<Spec, { kind: "mcnemar" }>);
    default:
      return true;
  }
}

/** A 2 × 2 table exists with these margins and this share of changers. */
export function mcnemarValid(s: Extract<Spec, { kind: "mcnemar" }>): boolean {
  const { yesNo, noYes } = mcnemarCells(s);
  return s.p2 > 0 && s.p2 < 1 && s.disc <= 1 && yesNo >= 0 && noYes >= 0 && yesNo <= s.p1 && noYes <= 1 - s.p1 && s.p1 !== s.p2;
}

function effectCeiling(spec: Spec): number {
  switch (spec.kind) {
    case "means":
      return spec.sd * 100;
    case "paired":
      return spec.sdDiff * 100;
    case "props":
      return (spec.fixed === "p2" ? (spec.p1 >= spec.p2 ? 1 - spec.p2 : spec.p2) : spec.p2 >= spec.p1 ? 1 - spec.p1 : spec.p1) - 1e-6;
    case "anova":
    case "factorial":
    case "rm":
    case "chisq":
      return 100;
    case "corr":
      return 0.999999;
    case "reg":
      return 1 - spec.r2Base - 1e-6;
    case "logit":
      return Math.log(200);
    case "mcnemar": {
      // Largest change that still fits a 2 × 2 table with these margins.
      let hi = spec.disc;
      if (!mcnemarValid(withEffect(spec, hi) as Extract<Spec, { kind: "mcnemar" }>)) {
        let lo = 0;
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (mcnemarValid(withEffect(spec, mid) as Extract<Spec, { kind: "mcnemar" }>)) lo = mid;
          else hi = mid;
        }
        return lo;
      }
      return hi - 1e-6;
    }
  }
}

/** Smallest effect detectable with n at the target power; null when out of reach. */
export function solveEffect(spec: Spec, test: Test, n: number, target: number): number | null {
  let lo = 0;
  let hi = effectCeiling(spec);
  if (power(withEffect(spec, hi), test, n) < target) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (power(withEffect(spec, mid), test, n) >= target) hi = mid;
    else lo = mid;
    if (hi - lo < 1e-7 * hi) break;
  }
  return hi;
}

/** Share among the cases from the share among controls and an odds ratio. */
export function p1FromOdds(p0: number, or: number): number {
  return (or * p0) / (1 + p0 * (or - 1));
}

/** Cohen's f from planned group means and a common SD. */
export function cohenF(means: number[], sd: number): number {
  const m = means.reduce((a, b) => a + b, 0) / means.length;
  return Math.sqrt(means.reduce((s, x) => s + (x - m) ** 2, 0) / means.length) / sd;
}

/**
 * Cohen's f of the row effect, the column effect and the interaction of a table of
 * planned cell means (equal cells), as G*Power defines them.
 */
export function twoWayF(table: number[][], sd: number): { rows: number; cols: number; inter: number } {
  const r = table.length;
  const c = table[0].length;
  const grand = table.flat().reduce((a, b) => a + b, 0) / (r * c);
  const rowMeans = table.map((row) => row.reduce((a, b) => a + b, 0) / c);
  const colMeans = table[0].map((_, j) => table.reduce((a, row) => a + row[j], 0) / r);
  const ms = (xs: number[]) => xs.reduce((s, x) => s + x * x, 0) / xs.length;
  const inter = table.flatMap((row, i) => row.map((x, j) => x - rowMeans[i] - colMeans[j] + grand));
  return {
    rows: Math.sqrt(ms(rowMeans.map((x) => x - grand))) / sd,
    cols: Math.sqrt(ms(colMeans.map((x) => x - grand))) / sd,
    inter: Math.sqrt(ms(inter)) / sd,
  };
}

/** Cohen's w of a table of expected percentages per group (equal groups); each row is rescaled to 1. */
export function cohenW(table: number[][]): number {
  const rows = table.map((row) => {
    const s = row.reduce((a, b) => a + b, 0);
    return row.map((x) => x / s);
  });
  const r = rows.length;
  const q = rows[0].map((_, j) => rows.reduce((a, row) => a + row[j], 0) / r);
  let w2 = 0;
  for (const row of rows) row.forEach((p, j) => (w2 += (p - q[j]) ** 2 / q[j]));
  return Math.sqrt(w2 / r);
}

/** Cohen's w of a goodness-of-fit test: observed shares against expected ones. */
export function cohenWFit(p: number[], p0: number[]): number {
  const s = p.reduce((a, b) => a + b, 0);
  const s0 = p0.reduce((a, b) => a + b, 0);
  return Math.sqrt(p.reduce((acc, x, j) => acc + (x / s - p0[j] / s0) ** 2 / (p0[j] / s0), 0));
}

/** Pooled SD of two groups. */
export function pooledSd(sd1: number, n1: number, sd2: number, n2: number): number {
  return Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (n1 + n2 - 2));
}

/** SD of a group recovered from the confidence interval of its mean. */
export function sdFromCi(lower: number, upper: number, n: number, confidence: number): number {
  return (Math.sqrt(n) * (upper - lower)) / (2 * qt(1 - (1 - confidence) / 2, n - 1));
}

/** SD estimated from the interquartile range, for roughly symmetric data. */
export const sdFromIqr = (q1: number, q3: number) => (q3 - q1) / 1.349;

/** Upper confidence limit of an SD from a small pilot (Browne 1995). */
export function sdUpper(sd: number, df: number, level: number, qchisq: (p: number, df: number) => number): number {
  return sd * Math.sqrt(df / qchisq(1 - level, df));
}

/** Rounded-up inflation for an expected dropout share. */
export const withDropout = (n: number, dropout: number) => Math.ceil(n / (1 - dropout) - 1e-9);

/** Worst-case asymptotic relative efficiency of rank tests against t tests. */
export const RANK_ARE = 0.864;

export { pt };
