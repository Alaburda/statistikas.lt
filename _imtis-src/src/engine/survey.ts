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
 * has no confidence level or expected share to set.
 */
export function paniottoN(margin: number, population: number | null): number {
  return Math.ceil(1 / (margin * margin + (population === null ? 0 : 1 / population)) - 1e-9);
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
