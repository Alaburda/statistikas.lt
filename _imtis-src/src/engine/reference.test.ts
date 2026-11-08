// The engine against real R output (scripts/reference.R): base R, pwr and PowerTOST.
import { describe, expect, it } from "vitest";
import { ABEL_CAP_CV, abelLimits, powerABEL, sampleNABEL } from "./abel";
import { DESIGNS, cvUpper, powerTOST, sampleNTOST, tolerance, type BeInput, type DesignId } from "./be";
import { cohenF, cohenW, power, sizes, solveN, twoWayF, type Spec, type Test } from "./compare";
import { owensQ, pnchisq, pnct, pnf, qchisq, qt } from "./dist";
import ref from "./reference.json";

const close = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);

interface Row {
  [key: string]: number | string;
}
const rows = (name: keyof typeof ref) => ref[name] as unknown as Row[];
const test2 = (r: Row): Test => ({ alpha: r.alpha as number, sides: r.alt === "two.sided" ? 2 : 1 });

describe("distributions", () => {
  it("non-central t matches pt", () => {
    for (const r of rows("pnt")) close(pnct(r.t as number, r.df as number, r.ncp as number), r.p as number, 1e-9);
  });
  it("non-central F matches pf", () => {
    for (const r of rows("pnf")) close(pnf(r.f as number, r.df1 as number, r.df2 as number, r.ncp as number), r.p as number, 1e-9);
  });
  it("quantiles match qt and qchisq", () => {
    for (const r of rows("quantiles")) {
      close(qt(r.p as number, r.df as number), r.qt as number, 1e-8);
      close(qchisq(r.p as number, r.df as number), r.qchisq as number, 1e-7);
    }
  });
  it("Owen's Q matches PowerTOST::OwensQ", () => {
    for (const r of rows("owensq")) close(owensQ(r.nu as number, r.t as number, r.delta as number, r.b as number), r.q as number, 1e-8);
  });
});

describe("comparing groups", () => {
  const check = (spec: Spec, test: Test, r: Row, tol = 1e-8) => {
    expect(solveN(spec, test, r.power as number)).toBe(r.n);
    close(power(spec, test, r.n as number), r.achieved as number, tol);
  };

  it("two means match pwr.t.test", () => {
    for (const r of rows("means")) check({ kind: "means", delta: r.d as number, sd: 1, ratio: 1 }, test2(r), r);
  });
  it("unequal groups match pwr.t2n.test", () => {
    for (const r of rows("meansUnequal")) {
      const spec: Spec = { kind: "means", delta: r.d as number, sd: 1, ratio: r.k as number };
      expect(sizes(spec, r.n1 as number)[1]).toBe(r.n2);
      close(power(spec, { alpha: r.alpha as number, sides: 2 }, r.n1 as number), r.power as number, 1e-7);
    }
  });
  it("paired means match pwr.t.test", () => {
    for (const r of rows("paired")) check({ kind: "paired", delta: r.d as number, sdDiff: 1 }, test2(r), r);
  });
  it("two proportions match power.prop.test", () => {
    for (const r of rows("props")) {
      check({ kind: "props", p1: r.p1 as number, p2: r.p2 as number, ratio: 1 }, { alpha: r.alpha as number, sides: 2 }, r, 1e-6);
    }
  });
  it("unequal proportions reach the target in a simulation of the actual test", () => {
    for (const r of rows("propsUnequal")) {
      const spec: Spec = { kind: "props", p1: r.p1 as number, p2: r.p2 as number, ratio: r.k as number };
      expect(solveN(spec, { alpha: 0.05, sides: 2 }, 0.8)).toBe(r.n1);
      // The normal approximation errs towards too many subjects at small n (about
      // 0.83 at n1 = 17, confirmed by exact enumeration), and must never fall short.
      expect(r.simPower as number).toBeGreaterThan(0.795);
      expect(r.simPower as number).toBeLessThan(0.84);
    }
  });
  it("ANOVA matches pwr.anova.test", () => {
    for (const r of rows("anova")) {
      check({ kind: "anova", groups: r.k as number, f: r.f as number }, { alpha: r.alpha as number, sides: 2 }, r, 1e-6);
    }
  });
  it("correlation matches pwr.r.test", () => {
    for (const r of rows("corr")) check({ kind: "corr", r: r.r as number }, test2(r), r, 1e-8);
  });
});

describe("models beyond pwr", () => {
  const t05: Test = { alpha: 0.05, sides: 2 };
  const check = (spec: Spec, test: Test, r: Row, tol = 1e-7) => {
    expect(solveN(spec, test, r.power as number), JSON.stringify(r)).toBe(r.n);
    close(power(spec, test, r.n as number), r.achieved as number, tol);
  };

  it("non-central chi-square matches pchisq", () => {
    for (const r of rows("pnchisq")) close(pnchisq(r.x as number, r.df as number, r.ncp as number), r.p as number, 1e-10);
  });
  it("chi-square tests match pwr.chisq.test", () => {
    // df = (rows - 1)(cols - 1) with two rows.
    for (const r of rows("chisq")) check({ kind: "chisq", rows: 2, cols: (r.df as number) + 1, w: r.w as number }, { alpha: r.alpha as number, sides: 2 }, r);
  });
  it("regression R² from zero matches pwr.f2.test", () => {
    for (const r of rows("reg")) {
      const f2 = r.f2 as number;
      const spec: Spec = { kind: "reg", predictors: r.u as number, tested: r.u as number, r2Base: 0, r2Gain: f2 / (1 + f2) };
      check(spec, { alpha: r.alpha as number, sides: 2 }, r);
    }
  });
  it("R² increase matches the G*Power formula", () => {
    for (const r of rows("regGain")) {
      const spec: Spec = { kind: "reg", predictors: r.p as number, tested: r.q as number, r2Base: r.base as number, r2Gain: r.gain as number };
      check(spec, t05, r);
    }
  });
  it("factorial ANOVA and ANCOVA match the G*Power formula", () => {
    for (const r of rows("factorial")) {
      const spec: Spec = { kind: "factorial", a: r.a as number, b: r.b as number, effect: r.effect as "A", f: r.f as number, covariates: r.cov as number };
      check(spec, t05, r);
    }
    for (const r of rows("ancova")) check({ kind: "anova", groups: r.k as number, f: r.f as number, covariates: r.cov as number }, t05, r);
  });
  it("repeated measures match the G*Power formulas", () => {
    for (const r of rows("rm")) {
      const spec: Spec = {
        kind: "rm",
        groups: r.k as number,
        times: r.m as number,
        effect: r.effect as "within",
        f: r.f as number,
        rho: r.rho as number,
        eps: r.eps as number,
      };
      check(spec, t05, r);
    }
  });
  it("repeated measures formulas hold in a simulation of the split-plot ANOVA", () => {
    for (const r of ref.rmSim) {
      const f = twoWayF(r.means, r.sd);
      const fx = r.effect === "within" ? f.cols : r.effect === "between" ? f.rows : f.inter;
      close(fx, r.f, 1e-10);
      const spec: Spec = { kind: "rm", groups: r.means.length, times: r.means[0].length, effect: r.effect as "within", f: fx, rho: r.rho, eps: 1 };
      expect(solveN(spec, t05, 0.8)).toBe(r.n);
      close(r.simPower, r.power, 0.015);
    }
  });
  it("factorial and ANCOVA formulas hold in simulations with lm", () => {
    for (const r of ref.factorialSim) {
      const f = twoWayF(r.means, r.sd);
      const fx = r.effect === "A" ? f.rows : r.effect === "B" ? f.cols : f.inter;
      close(fx, r.f, 1e-10);
      expect(solveN({ kind: "factorial", a: r.means.length, b: r.means[0].length, effect: r.effect as "A", f: fx }, t05, 0.8)).toBe(r.n);
      close(r.simPower, r.power, 0.025);
    }
    for (const r of ref.ancovaSim) {
      const f = cohenF(r.means, r.sd) / Math.sqrt(1 - r.r * r.r);
      expect(solveN({ kind: "anova", groups: r.means.length, f, covariates: 1 }, t05, 0.8)).toBe(r.n);
      // G*Power treats the covariate as fixed; with a random one the real test loses a little.
      close(r.simPower, r.power, 0.03);
    }
  });
  it("logistic regression matches Demidenko's formula and a simulation of the Wald test", () => {
    for (const r of rows("logit")) {
      const spec: Spec = { kind: "logit", x: r.x as "binary", p0: r.p0 as number, or: r.or as number, share: r.share as number, r2: r.r2 as number };
      check(spec, t05, r, 1e-6);
    }
    for (const r of ref.logitSim) close(r.simPower, r.power, 0.035);
  });
  it("McNemar matches exact enumeration in R and simulated binom.test", () => {
    for (const r of rows("mcnemar")) {
      const spec: Spec = { kind: "mcnemar", p1: r.p1 as number, p2: r.p2 as number, disc: r.disc as number };
      check(spec, { alpha: 0.05, sides: r.sides as 1 | 2 }, r, 1e-9);
    }
    for (const r of ref.mcnemarSim) {
      close(power({ kind: "mcnemar", p1: r.p1, p2: r.p2, disc: r.disc }, t05, r.n), r.power, 1e-9);
      close(r.simPower, r.power, 0.012);
    }
  });
  it("Cohen's w of a table", () => {
    // 2 × 2 with 30 % vs 50 %: w = |p1 - p2| / (2 sqrt(pbar (1 - pbar))).
    close(cohenW([[30, 70], [50, 50]]), 0.2 / (2 * Math.sqrt(0.4 * 0.6)), 1e-12);
  });
});

describe("average bioequivalence", () => {
  const input = (r: Row): BeInput => ({
    alpha: r.alpha as number,
    theta0: r.theta0 as number,
    theta1: (r.theta1 as number) ?? 0.8,
    theta2: (r.theta2 as number) ?? 1.25,
    cv: r.cv as number,
    design: r.design as DesignId,
  });

  it("has every PowerTOST design", () => {
    expect(new Set(rows("tost").map((r) => r.design))).toEqual(new Set(Object.keys(DESIGNS)));
  });
  it("sample size and power match sampleN.TOST on the full grid", () => {
    for (const r of rows("tost")) {
      const res = sampleNTOST(input(r), r.power as number);
      expect(res?.n, JSON.stringify(r)).toBe(r.n);
      close(res!.power, r.achieved as number, 1e-6);
    }
  });
  it("matches with narrow limits, other alphas and large studies", () => {
    for (const r of rows("tostLimits")) {
      const res = sampleNTOST(input(r), r.power as number);
      expect(res?.n, JSON.stringify(r)).toBe(r.n);
      close(res!.power, r.achieved as number, 1e-6);
    }
  });
  it("matches power.TOST for unbalanced sequences", () => {
    const base = { alpha: 0.05, theta1: 0.8, theta2: 1.25 };
    for (const r of ref.tostUnbalanced) {
      close(powerTOST({ ...base, theta0: r.theta0, cv: r.cv, design: r.design as DesignId }, r.n), r.power, 1e-6);
    }
    for (const r of ref.tostOdd) close(powerTOST({ ...base, theta0: 0.95, cv: 0.3, design: "2x2" }, r.n), r.power, 1e-6);
  });
  it("upper CV limit matches CVCL", () => {
    for (const r of rows("cvcl")) close(cvUpper(r.cv as number, r.df as number, r.alpha as number), r.upper as number, 1e-8);
  });
  it("sensitivity matches pa.ABE", () => {
    const t = tolerance({ alpha: 0.05, theta0: 0.95, theta1: 0.8, theta2: 1.25, cv: 0.25, design: "2x2" }, ref.pa.n, 0.7);
    close(t.cvMax, ref.pa.cvMax, 1e-5);
    close(t.gmrWorst, ref.pa.gmrMin, 1e-5);
    expect(t.nMin).toBe(ref.pa.nMin);
  });
});

describe("expanding limits (ABEL)", () => {
  it("limits match scABEL", () => {
    for (const r of ref.abelLimits) {
      const [lo, hi] = abelLimits(r.cv);
      close(lo, r.lower, 1e-4);
      close(hi, r.upper, 1e-4);
    }
    expect(abelLimits(ABEL_CAP_CV)[1]).toBeCloseTo(1.4319, 3);
  });
  it("simulated power agrees with power.scABEL within simulation error", () => {
    for (const r of rows("abelPower")) {
      const p = powerABEL(r.design as "2x3x3", r.cv as number, r.theta0 as number, r.n as number, 0.05, 400_000);
      close(p, r.power as number, 0.004);
    }
  });
  it("sample size agrees with sampleN.scABEL to within one sequence block", () => {
    let exact = 0;
    for (const r of rows("abel")) {
      const res = sampleNABEL(r.design as "2x3x3", r.cv as number, r.theta0 as number, 0.8);
      const steps = r.design === "2x3x3" ? 3 : 2;
      expect(Math.abs(res!.n - (r.n as number)), JSON.stringify(r)).toBeLessThanOrEqual(steps);
      if (res!.n === r.n) exact += 1;
    }
    expect(exact / rows("abel").length).toBeGreaterThan(0.75);
  });
});
