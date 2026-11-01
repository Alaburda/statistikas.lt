// Power and sample size for comparing groups. Each design defines power(n); solving
// for n or for the smallest detectable effect is generic search on top of that.

import { pnct, pnf, pnorm, pt, qfUpper, qnorm, qt } from "./dist";

export type Spec =
  | { kind: "means"; delta: number; sd: number; ratio: number }
  | { kind: "paired"; delta: number; sdDiff: number }
  /** fixed: which share is known; the other one moves when the effect changes. */
  | { kind: "props"; p1: number; p2: number; ratio: number; fixed?: "p1" | "p2" }
  | { kind: "anova"; groups: number; f: number }
  | { kind: "corr"; r: number };

export interface Test {
  alpha: number;
  sides: 1 | 2;
}

/** Group sizes for a given base n (n1 for two-group designs, per group for ANOVA). */
export function sizes(spec: Spec, n: number): number[] {
  switch (spec.kind) {
    case "means":
    case "props":
      return [n, Math.ceil(n * spec.ratio - 1e-9)];
    case "anova":
      return Array.from({ length: spec.groups }, () => n);
    case "paired":
    case "corr":
      return [n];
  }
}

export const minN = (spec: Spec): number => (spec.kind === "corr" ? 4 : 2);

function tPower(ncp: number, df: number, { alpha, sides }: Test): number {
  const q = qt(1 - alpha / sides, df);
  const upper = 1 - pnct(q, df, ncp);
  return sides === 2 ? upper + pnct(-q, df, ncp) : upper;
}

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
    case "anova": {
      const df2 = spec.groups * (n - 1);
      if (df2 < 1) return 0;
      const crit = qfUpper(test.alpha, spec.groups - 1, df2);
      return 1 - pnf(crit, spec.groups - 1, df2, spec.groups * n * spec.f * spec.f);
    }
    case "corr":
      return corrPower(spec.r, n, test);
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

const MAX_N = 50_000_000;

/** Smallest whole n reaching the target power; null when no realistic n does. */
export function solveN(spec: Spec, test: Test, target: number): number | null {
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
      return { ...spec, f: e };
    case "corr":
      return { ...spec, r: e };
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
      return spec.f;
    case "corr":
      return Math.abs(spec.r);
  }
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
      return 100;
    case "corr":
      return 0.999999;
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
