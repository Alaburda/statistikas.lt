// Survey sample sizes: how many answers are needed to estimate a share or a mean in
// a known population, how many invitations that takes, and how to split them.

import { qnorm } from "./dist";

export interface SurveyInput {
  /** Population size; null when it is unknown or very large. */
  population: number | null;
  /** Half-width of the confidence interval, as a share (0.05 = ±5 %). */
  margin: number;
  confidence: number;
  /** Expected share; 0.5 is the worst case. */
  p: number;
  /** Design effect for cluster sampling; 1 = simple random sampling. */
  deff: number;
}

export const zOf = (confidence: number) => qnorm(1 - (1 - confidence) / 2);

/** Finite population correction, then rounded up. */
function correct(n0: number, population: number | null): number {
  return population === null ? Math.ceil(n0 - 1e-9) : Math.ceil(n0 / (1 + (n0 - 1) / population) - 1e-9);
}

/** Cochran's formula for a proportion with the finite population correction. */
export function cochranN({ population, margin, confidence, p, deff }: SurveyInput): number {
  const z = zOf(confidence);
  return correct((z * z * p * (1 - p) * deff) / (margin * margin), population);
}

/**
 * The formula Lithuanian theses usually call Paniotto's and the English literature
 * Yamane's: n = 1 / (margin² + 1/N). It is Cochran with z = 2 and p = 0.5, so it
 * has no confidence level or expected share to set. A design effect multiplies the
 * variance as in Cochran's formula: n = deff / (margin² + deff/N).
 */
export function paniottoN(margin: number, population: number | null, deff = 1): number {
  return Math.ceil(deff / (margin * margin + (population === null ? 0 : deff / population)) - 1e-9);
}

/** Survey estimating a mean: margin and sd are in the units of the measure. */
export function meanN(sd: number, margin: number, confidence: number, population: number | null, deff: number): number {
  const z = zOf(confidence);
  return correct((z * z * sd * sd * deff) / (margin * margin), population);
}

/** Margin of error actually reached with n answers. */
export function marginOf(n: number, input: Omit<SurveyInput, "margin">): number {
  const { population, confidence, p, deff } = input;
  const fpc = population === null || n >= population ? (n >= (population ?? Infinity) ? 0 : 1) : (population - n) / (population - 1);
  return zOf(confidence) * Math.sqrt((p * (1 - p) * deff * fpc) / n);
}

export function meanMarginOf(n: number, sd: number, confidence: number, population: number | null, deff: number): number {
  const fpc = population === null ? 1 : n >= population ? 0 : (population - n) / (population - 1);
  return zOf(confidence) * sd * Math.sqrt((deff * fpc) / n);
}

export const designEffect = (clusterSize: number, icc: number) => 1 + (clusterSize - 1) * icc;

/** Wilson score interval for x of n. */
export function wilson(x: number, n: number, confidence: number): [number, number] {
  const z = zOf(confidence);
  const p = x / n;
  const mid = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const div = 1 + (z * z) / n;
  return [Math.max((mid - half) / div, 0), Math.min((mid + half) / div, 1)];
}

/**
 * The share to plan with after a small pilot: the end of its interval nearest 50 %,
 * or 50 % itself when the interval covers it. A pilot's point estimate is too noisy
 * to plan on, and underestimating p(1 - p) leaves the survey short of answers.
 */
export function plannedShare(x: number, n: number, confidence: number): number {
  const [lo, hi] = wilson(x, n, confidence);
  return hi < 0.5 ? hi : lo > 0.5 ? lo : 0.5;
}

/** One figure the survey has to deliver: a share or a mean, with its own margin. */
export interface Estimate {
  name: string;
  kind: "share" | "mean";
  /** Expected share as a fraction, or the expected SD of a mean. */
  value: number;
  /** Fraction for a share, units of the measure for a mean. */
  margin: number;
}

export interface EstimateContext {
  population: number | null;
  confidence: number;
  deff: number;
  formula: "cochran" | "paniotto";
}

/** Paniotto's formula is only for shares, so a mean always goes through Cochran's. */
export function estimateN(e: Estimate, ctx: EstimateContext): number {
  const { population, confidence, deff, formula } = ctx;
  if (e.kind === "mean") return meanN(e.value, e.margin, confidence, population, deff);
  if (formula === "paniotto") return paniottoN(e.margin, population, deff);
  return cochranN({ population, margin: e.margin, confidence, p: e.value, deff });
}

export function estimateMargin(e: Estimate, answers: number, ctx: EstimateContext): number {
  const { population, confidence, deff } = ctx;
  return e.kind === "mean"
    ? meanMarginOf(answers, e.value, confidence, population, deff)
    : marginOf(answers, { population, confidence, p: e.value, deff });
}

/** Bonferroni: the level each of k estimates needs so that all hold at once. */
export const jointConfidence = (confidence: number, k: number) => 1 - (1 - confidence) / k;

/** Invitations needed for n answers; never more than the whole population. */
export function invitations(n: number, responseRate: number, population: number | null) {
  const needed = Math.ceil(n / responseRate - 1e-9);
  const possible = population === null || needed <= population;
  return {
    needed,
    /** False when even inviting everyone yields fewer than n answers. */
    possible,
    send: possible ? needed : population!,
    expectedAnswers: possible ? n : Math.floor(population! * responseRate),
  };
}

/**
 * Worst-case bounds on the true share when only part of the group answered: everyone
 * silent could be a "no", or everyone a "yes". No sample size narrows this.
 */
export function nonresponseBounds(p: number, responseRate: number): [number, number] {
  return [p * responseRate, p * responseRate + (1 - responseRate)];
}

export interface Stratum {
  name: string;
  size: number;
}

/** Proportional allocation by largest remainder, so the parts add up to n exactly. */
export function allocate(strata: Stratum[], n: number): number[] {
  const total = strata.reduce((s, x) => s + x.size, 0);
  if (total === 0) return strata.map(() => 0);
  const exact = strata.map((s) => (n * s.size) / total);
  const out = exact.map(Math.floor);
  let left = n - out.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => ({ i, rest: v - Math.floor(v) })).sort((a, b) => b.rest - a.rest);
  for (const { i } of order) {
    if (left <= 0) break;
    if (out[i] < strata[i].size) {
      out[i] += 1;
      left -= 1;
    }
  }
  return out;
}
