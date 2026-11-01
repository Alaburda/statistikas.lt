// Average bioequivalence with expanding limits (EMA's ABEL) for highly variable drugs.
// There is no closed form, so power is simulated from the distributions of the key
// statistics, the same scheme as PowerTOST's power.scABEL. Seeded, hence repeatable.

import { qt } from "./dist";
import { sampleNTOST, type BeInput } from "./be";

export type AbelDesign = "2x3x3" | "2x2x4" | "2x2x3";

export const ABEL_SWITCH_CV = 0.3;
export const ABEL_CAP_CV = 0.5;
export const ABEL_CONSTANT = 0.76;

const cvToS2 = (cv: number) => Math.log(1 + cv * cv);

/** Widened acceptance range for a within-reference CV (conventional 80–125 % below 30 %). */
export function abelLimits(cv: number): [number, number] {
  if (cv <= ABEL_SWITCH_CV) return [0.8, 1.25];
  const capped = Math.min(cv, ABEL_CAP_CV);
  const u = Math.exp(ABEL_CONSTANT * Math.sqrt(cvToS2(capped)));
  return [1 / u, u];
}

class Rng {
  private s: number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** mulberry32. */
  uniform(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  normal(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u: number;
    let v: number;
    let s: number;
    do {
      u = 2 * this.uniform() - 1;
      v = 2 * this.uniform() - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * m;
    return u * m;
  }

  /** Chi-square divided by its df (Marsaglia–Tsang gamma sampler). */
  scaledChi2(df: number): number {
    const shape = df / 2;
    const boost = shape < 1 ? Math.pow(this.uniform(), 1 / shape) : 1;
    const d = (shape < 1 ? shape + 1 : shape) - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const x = this.normal();
      const v0 = 1 + c * x;
      if (v0 <= 0) continue;
      const v = v0 * v0 * v0;
      const u = this.uniform();
      if (u < 1 - 0.0331 * x * x * x * x || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return (2 * d * v * boost) / df;
      }
    }
  }
}

const SEQUENCES: Record<AbelDesign, number> = { "2x3x3": 3, "2x2x4": 2, "2x2x3": 2 };
const BKNI: Record<AbelDesign, number> = { "2x3x3": 1 / 6, "2x2x4": 1 / 4, "2x2x3": 3 / 8 };

export const DEFAULT_SIMS = 100_000;

export function powerABEL(
  design: AbelDesign,
  cv: number,
  theta0: number,
  n: number,
  alpha = 0.05,
  sims = DEFAULT_SIMS,
  seed = 123456
): number {
  const seqs = SEQUENCES[design];
  const nv = Array.from({ length: seqs }, (_, i) => Math.floor(n / seqs) + (i < n % seqs ? 1 : 0));
  const total = nv.reduce((a, b) => a + b, 0);
  const c2 = nv.reduce((s, x) => s + 1 / x, 0) * BKNI[design];
  const s2 = cvToS2(cv);
  const df = design === "2x2x4" ? 3 * total - 4 : 2 * total - 3;
  const dfRR = design === "2x2x3" ? nv[1] - 1 : total - 2;
  const dfTT = design === "2x2x3" ? nv[0] - 1 : total - 2;
  if (df < 1 || dfRR < 1 || dfTT < 1) return 0;

  const tcrit = qt(1 - alpha, df);
  const sdm = Math.sqrt(s2 * c2);
  const mlog = Math.log(theta0);
  const s2switch = cvToS2(ABEL_SWITCH_CV);
  const s2cap = cvToS2(ABEL_CAP_CV);
  const capLimit = ABEL_CONSTANT * Math.sqrt(s2cap);
  const lnLower = Math.log(0.8);
  const lnUpper = Math.log(1.25);
  const lowCv = s2 <= cvToS2(0.2);
  const rng = new Rng(seed);

  let pass = 0;
  for (let i = 0; i < sims; i++) {
    const mean = mlog + sdm * rng.normal();
    const s2R = s2 * rng.scaledChi2(dfRR);
    const s2T = s2 * rng.scaledChi2(dfTT);
    const mseAbe = s2 * rng.scaledChi2(df);
    const mse =
      design === "2x3x3"
        ? (s2T + 2 * s2R) / 3
        : design === "2x2x4"
          ? (mseAbe + (s2T + s2R) / 2) / 2
          : 0.5 * mseAbe +
            (0.5 * ((dfTT + 1) * (2 * s2T + s2R) / 3 + ((dfRR + 1) * (s2T + 2 * s2R)) / 3)) / (dfTT + dfRR + 2);

    let be: boolean;
    if (s2R > s2switch) {
      const limit = s2R > s2cap ? capLimit : ABEL_CONSTANT * Math.sqrt(s2R);
      const hw = tcrit * Math.sqrt(c2 * mse);
      be = -limit <= mean - hw && mean + hw <= limit;
    } else {
      const hw = tcrit * Math.sqrt(c2 * (lowCv ? mseAbe : mse));
      be = lnLower <= mean - hw && mean + hw <= lnUpper;
    }
    if (be && mean >= lnLower && mean <= lnUpper) pass += 1;
  }
  return pass / sims;
}

/** Smallest balanced n with simulated power at or above the target. */
export function sampleNABEL(
  design: AbelDesign,
  cv: number,
  theta0: number,
  target: number,
  alpha = 0.05,
  sims = DEFAULT_SIMS
): { n: number; power: number } | null {
  const steps = SEQUENCES[design];
  const [lower, upper] = abelLimits(cv);
  if (theta0 <= 0.8 || theta0 >= 1.25) return null;
  const input: BeInput = { alpha, theta0, theta1: lower, theta2: upper, cv, design };
  const start = sampleNTOST(input, target);
  let n = Math.max(start?.n ?? 2 * steps * 6, 2 * steps * 2);
  n = steps * Math.ceil(n / steps);
  const minimum = Math.max(12, 2 * steps * 2);
  let pwr = powerABEL(design, cv, theta0, n, alpha, sims);
  while (pwr >= target && n - steps >= minimum) {
    const lowerPower = powerABEL(design, cv, theta0, n - steps, alpha, sims);
    if (lowerPower < target) break;
    n -= steps;
    pwr = lowerPower;
  }
  let guard = 0;
  while (pwr < target) {
    n += steps;
    pwr = powerABEL(design, cv, theta0, n, alpha, sims);
    if (++guard > 2000) return null;
  }
  return { n, power: pwr };
}
