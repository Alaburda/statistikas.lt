import { describe, expect, it } from "vitest";
import { fitLogistic, getTest } from "./tests";
import type { Dataset } from "../types";

/** Parse a formatted table cell (Lithuanian decimal comma) back to a number. */
const num = (s: unknown): number => Number(String(s).replace(",", "."));

// With a single binary predictor, logistic regression has a closed form:
// intercept = log-odds in the reference group, slope = log odds ratio,
// SE(slope) = sqrt(1/a + 1/b + 1/c + 1/d). Cells: x=0 → 30 events / 70 non,
// x=1 → 60 events / 40 non.
const cells = [
  { x: 0, y: 1, n: 30 },
  { x: 0, y: 0, n: 70 },
  { x: 1, y: 1, n: 60 },
  { x: 1, y: 0, n: 40 },
];

function expand(): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (const c of cells)
    for (let i = 0; i < c.n; i++) {
      x.push(c.x);
      y.push(c.y);
    }
  return { x, y };
}

describe("fitLogistic (IRLS)", () => {
  it("recovers analytic coefficients for a 2×2 design", () => {
    const { x, y } = expand();
    const fit = fitLogistic([x], y);
    expect(fit.converged).toBe(true);
    expect(fit.beta[0]).toBeCloseTo(Math.log(30 / 70), 6);
    expect(fit.beta[1]).toBeCloseTo(Math.log((60 / 40) / (30 / 70)), 6); // log OR = log 3.5
    expect(fit.se[1]).toBeCloseTo(Math.sqrt(1 / 30 + 1 / 70 + 1 / 60 + 1 / 40), 6);
  });

  it("reports a likelihood-ratio test that detects the association", () => {
    const { x, y } = expand();
    const fit = fitLogistic([x], y);
    expect(fit.pModel).toBeLessThan(0.001);
    expect(fit.nagelkerke).toBeGreaterThan(0);
    expect(fit.nagelkerke).toBeLessThan(1);
  });
});

describe("logistic regression test definition", () => {
  it("dummy-codes a categorical predictor and reports the odds ratio", () => {
    const rows: Record<string, number | string | null>[] = [];
    for (const c of cells)
      for (let i = 0; i < c.n; i++) rows.push({ grp: c.x === 1 ? "b" : "a", out: String(c.y) });
    const ds: Dataset = {
      name: "synthetic",
      description: "",
      variables: [
        { key: "out", label: "Outcome", type: "categorical" },
        { key: "grp", label: "Group", type: "categorical" },
      ],
      rows,
    };
    const res = getTest("logistic").run(ds, { outcome: "out", predictors: "grp" });
    const slopeRow = res.tables[0].rows[1];
    expect(num(slopeRow[1])).toBeCloseTo(Math.log(3.5), 2); // B
    expect(num(slopeRow[5])).toBeCloseTo(3.5, 2); // OR
    expect(res.pValue).toBeLessThan(0.001);
    // Events-per-predictor check should pass (90 events, 1 term).
    expect(res.assumptions?.[0].status).toBe("pass");
  });

  it("rejects a non-binary outcome", () => {
    const ds: Dataset = {
      name: "synthetic",
      description: "",
      variables: [
        { key: "out", label: "Outcome", type: "categorical" },
        { key: "x", label: "X", type: "numeric" },
      ],
      rows: [
        { out: "a", x: 1 },
        { out: "b", x: 2 },
        { out: "c", x: 3 },
      ],
    };
    expect(() => getTest("logistic").run(ds, { outcome: "out", predictors: "x" })).toThrow(/2 kategorijomis/);
  });
});
