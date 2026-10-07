import { describe, expect, it } from "vitest";
import {
  chiSquareUpperP,
  fUpperP,
  normalCdf,
  tTwoTailedP,
} from "./distributions";
import { getTest } from "./tests";
import { birthwt } from "../data/birthwt";
import { cps1985 } from "../data/cps1985";
import { DEMOS } from "../data/demos";
import type { Dataset } from "../types";

/** Parse a formatted table cell (Lithuanian decimal comma) back to a number. */
const num = (s: unknown): number => Number(String(s).replace(",", "."));

describe("distribution tails (analytic checkpoints)", () => {
  it("normal CDF at 1.96 ≈ 0.975", () => {
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 3);
  });
  it("two-tailed t with huge df ≈ normal", () => {
    expect(tTwoTailedP(1.959964, 1e7)).toBeCloseTo(0.05, 3);
  });
  it("chi-square critical values", () => {
    expect(chiSquareUpperP(3.84146, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquareUpperP(5.99146, 2)).toBeCloseTo(0.05, 3);
  });
  it("F(1, large) tail equals squared-t", () => {
    expect(fUpperP(3.84146, 1, 1e7)).toBeCloseTo(0.05, 3);
  });
});

describe("test engine on synthetic data", () => {
  it("perfect linear correlation gives r=1, exact line", () => {
    const ds: Dataset = {
      name: "synthetic",
      description: "",
      variables: [
        { key: "x", label: "x", type: "numeric" },
        { key: "y", label: "y", type: "numeric" },
      ],
      rows: [1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 2 * x + 1 })),
    };
    const res = getTest("regression").run(ds, { outcome: "y", predictor: "x" });
    // slope row is the second coefficient row
    const slopeRow = res.tables[0].rows[1];
    expect(num(slopeRow[1])).toBeCloseTo(2, 6);
    const fit = res.tables[1].rows[0];
    expect(num(fit[0])).toBeCloseTo(1, 6); // R^2 = 1
  });

  it("multiple regression recovers exact coefficients on perfect linear data", () => {
    // y = 1 + 2*x1 + 3*x2
    const ds: Dataset = {
      name: "synthetic",
      description: "",
      variables: [
        { key: "y", label: "y", type: "numeric" },
        { key: "x1", label: "x1", type: "numeric" },
        { key: "x2", label: "x2", type: "numeric" },
      ],
      rows: [
        { x1: 1, x2: 2, y: 1 + 2 * 1 + 3 * 2 },
        { x1: 2, x2: 1, y: 1 + 2 * 2 + 3 * 1 },
        { x1: 3, x2: 4, y: 1 + 2 * 3 + 3 * 4 },
        { x1: 4, x2: 3, y: 1 + 2 * 4 + 3 * 3 },
        { x1: 5, x2: 2, y: 1 + 2 * 5 + 3 * 2 },
        { x1: 1, x2: 5, y: 1 + 2 * 1 + 3 * 5 },
      ],
    };
    const res = getTest("multiple_regression").run(ds, { outcome: "y", predictors: "x1,x2" });
    const coefRows = res.tables[0].rows;
    expect(num(coefRows[0][1])).toBeCloseTo(1, 4); // intercept
    expect(num(coefRows[1][1])).toBeCloseTo(2, 4); // x1
    expect(num(coefRows[2][1])).toBeCloseTo(3, 4); // x2
    expect(num(res.tables[1].rows[0][0])).toBeCloseTo(1, 4); // R² = 1
  });

  it("t-test recovers a known mean difference", () => {
    const ds: Dataset = {
      name: "synthetic",
      description: "",
      variables: [
        { key: "y", label: "y", type: "numeric" },
        { key: "g", label: "g", type: "categorical", valueLabels: { A: "A", B: "B" } },
      ],
      rows: [
        ...[10, 12, 11, 13, 9].map((y) => ({ y, g: "A" })),
        ...[20, 22, 21, 19, 23].map((y) => ({ y, g: "B" })),
      ],
    };
    const res = getTest("ttest").run(ds, { outcome: "y", group: "g" });
    expect(res.pValue!).toBeLessThan(0.001);
  });
});

describe("birthwt sanity checks vs R", () => {
  it("smoking lowers mean birth weight (significant t-test)", () => {
    const res = getTest("ttest").run(birthwt, { outcome: "bwt", group: "smoke" });
    expect(res.pValue!).toBeLessThan(0.05);
  });
  it("lwt and bwt are positively, weakly correlated (R: r≈0.186)", () => {
    const res = getTest("correlation").run(birthwt, { x: "lwt", y: "bwt" });
    const r = num(res.tables[0].rows[0][0]);
    expect(r).toBeGreaterThan(0.12);
    expect(r).toBeLessThan(0.25);
  });
  it("ANOVA of bwt by race is computed", () => {
    const res = getTest("anova").run(birthwt, { outcome: "bwt", group: "race" });
    expect(res.pValue).toBeGreaterThan(0);
    expect(res.pValue).toBeLessThan(1);
  });
});

describe("cps1985 sanity checks vs R", () => {
  it("has all 534 workers", () => {
    expect(cps1985.rows).toHaveLength(534);
  });
  it("wage differs by gender (R Welch t-test: p≈1.4e-6)", () => {
    const res = getTest("ttest").run(cps1985, { outcome: "wage", group: "gender" });
    expect(res.pValue!).toBeLessThan(1e-4);
  });
  it("education and wage correlate (R: r≈0.382)", () => {
    const res = getTest("correlation").run(cps1985, { x: "education", y: "wage" });
    const r = num(res.tables[0].rows[0][0]);
    expect(r).toBeGreaterThan(0.37);
    expect(r).toBeLessThan(0.39);
  });
});

describe("demo seeds", () => {
  for (const demo of DEMOS) {
    it(`${demo.id}: every seeded chunk runs without error`, () => {
      for (const c of demo.seed) {
        expect(() => getTest(c.testId).run(demo.dataset, c.picks)).not.toThrow();
      }
    });
  }
});
