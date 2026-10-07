// Automated assumption checks with plain-language guidance (Lithuanian).
// Normality: D'Agostino–Pearson K² omnibus test (skewness + kurtosis).
// Equal variances: Brown–Forsythe variant of Levene's test (median-centred).

import type { AssumptionCheck } from "../types";
import { chiSquareUpperP, fUpperP } from "./distributions";
import { fmt, fmtP, ltPlural } from "./format";
import { mean, median } from "./helpers";

/** "p < 0,001" or "p = 0,048" — reads correctly mid-sentence. */
const pPhrase = (p: number) => (p < 0.001 ? `p ${fmtP(p)}` : `p = ${fmtP(p)}`);

function centralMoments(x: number[]) {
  const n = x.length;
  const m = mean(x);
  let m2 = 0, m3 = 0, m4 = 0;
  for (const v of x) {
    const d = v - m;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  return { m2: m2 / n, m3: m3 / n, m4: m4 / n };
}

/** D'Agostino (1970) transformed skewness z-statistic. */
export function skewnessZ(x: number[]): number {
  const n = x.length;
  const { m2, m3 } = centralMoments(x);
  if (m2 === 0) return 0;
  const g1 = m3 / Math.pow(m2, 1.5);
  const Y = g1 * Math.sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)));
  const beta2 = (3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3)) /
    ((n - 2) * (n + 5) * (n + 7) * (n + 9));
  const W2 = -1 + Math.sqrt(2 * (beta2 - 1));
  const delta = 1 / Math.sqrt(Math.log(Math.sqrt(W2)));
  const alpha = Math.sqrt(2 / (W2 - 1));
  const t = Y / alpha;
  return delta * Math.log(t + Math.sqrt(t * t + 1));
}

/** Anscombe & Glynn (1983) transformed kurtosis z-statistic. */
export function kurtosisZ(x: number[]): number {
  const n = x.length;
  const { m2, m4 } = centralMoments(x);
  if (m2 === 0) return 0;
  const b2 = m4 / (m2 * m2);
  const Eb2 = (3 * (n - 1)) / (n + 1);
  const varB2 = (24 * n * (n - 2) * (n - 3)) / ((n + 1) ** 2 * (n + 3) * (n + 5));
  const xs = (b2 - Eb2) / Math.sqrt(varB2);
  const sqrtBeta1 = ((6 * (n * n - 5 * n + 2)) / ((n + 7) * (n + 9))) *
    Math.sqrt((6 * (n + 3) * (n + 5)) / (n * (n - 2) * (n - 3)));
  const A = 6 + (8 / sqrtBeta1) * (2 / sqrtBeta1 + Math.sqrt(1 + 4 / (sqrtBeta1 * sqrtBeta1)));
  const term1 = 1 - 2 / (9 * A);
  const denom = 1 + xs * Math.sqrt(2 / (A - 4));
  const term2 = Math.sign(denom) * Math.cbrt((1 - 2 / A) / Math.abs(denom));
  return (term1 - term2) / Math.sqrt(2 / (9 * A));
}

/** D'Agostino–Pearson K² omnibus normality test; null when n < 8. */
export function dagostinoK2(x: number[]): { k2: number; p: number } | null {
  if (x.length < 8) return null;
  const z1 = skewnessZ(x);
  const z2 = kurtosisZ(x);
  const k2 = z1 * z1 + z2 * z2;
  return { k2, p: chiSquareUpperP(k2, 2) };
}

/** Brown–Forsythe (median-centred Levene) test for equal variances; null if not computable. */
export function leveneBF(groups: number[][]): { F: number; df1: number; df2: number; p: number } | null {
  const usable = groups.filter((g) => g.length >= 2);
  if (usable.length < 2) return null;
  const z = usable.map((g) => {
    const med = median(g);
    return g.map((v) => Math.abs(v - med));
  });
  const all = z.flat();
  const grand = mean(all);
  const N = all.length;
  const k = z.length;
  let ssB = 0, ssW = 0;
  for (const g of z) {
    const gm = mean(g);
    ssB += g.length * (gm - grand) ** 2;
    for (const v of g) ssW += (v - gm) ** 2;
  }
  const df1 = k - 1;
  const df2 = N - k;
  if (df2 <= 0 || ssW === 0) return null;
  const F = (ssB / df1) / (ssW / df2);
  return { F, df1, df2, p: fUpperP(F, df1, df2) };
}

/**
 * Normality check for one sample, phrased for the assumptions panel.
 * `switchTo` (if given) is attached when the check does not pass.
 */
export function normalityCheck(
  label: string,
  values: number[],
  switchTo?: AssumptionCheck["switchTo"]
): AssumptionCheck {
  const test = dagostinoK2(values);
  if (!test) {
    return {
      label,
      status: "warn",
      detail: `Tik ${values.length} ${ltPlural(values.length, ["stebėjimas", "stebėjimai", "stebėjimų"])} – per mažai, kad normalumą būtų galima patikimai įvertinti (reikia ≥ 8). Parametrinių testų rezultatus interpretuokite atsargiai.`,
      switchTo,
    };
  }
  const small = values.length < 20 ? " (maža imtis – testo galia ribota)" : "";
  if (test.p > 0.05) {
    return {
      label,
      status: "pass",
      detail: `Nukrypimo nuo normalumo požymių nėra: D'Agostino K² = ${fmt(test.k2)}; ${pPhrase(test.p)}${small}.`,
    };
  }
  const skew = skewnessZ(values);
  const shape = Math.abs(skew) > 2 ? (skew > 0 ? " Pasiskirstymas turi dešininę asimetriją." : " Pasiskirstymas turi kairiąją asimetriją.") : "";
  return {
    label,
    status: "warn",
    detail: `Pasiskirstymas nukrypsta nuo normaliojo: D'Agostino K² = ${fmt(test.k2)}; ${pPhrase(test.p)}.${shape}`,
    switchTo,
  };
}

/** Equal-variances check across groups (Brown–Forsythe). */
export function equalVarianceCheck(groups: { label: string; values: number[] }[]): AssumptionCheck | null {
  const test = leveneBF(groups.map((g) => g.values));
  if (!test) return null;
  if (test.p > 0.05) {
    return {
      label: "Dispersijų lygybė",
      status: "pass",
      detail: `Grupių dispersijos panašios: Levene (Brown–Forsythe) testas F(${test.df1}; ${test.df2}) = ${fmt(test.F)}; ${pPhrase(test.p)}.`,
    };
  }
  return {
    label: "Dispersijų lygybė",
    status: "warn",
    detail: `Grupių dispersijos skiriasi: Levene (Brown–Forsythe) testas F(${test.df1}; ${test.df2}) = ${fmt(test.F)}; ${pPhrase(test.p)}. Grupių palyginimai, kuriuose daroma vienodos sklaidos prielaida, gali būti klaidinantys.`,
  };
}
