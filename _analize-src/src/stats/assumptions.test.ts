import { describe, expect, it } from "vitest";
import { dagostinoK2, leveneBF } from "./assumptions";
import { fisherExact2x2, normalQuantile } from "./distributions";

describe("D'Agostino–Pearson K² normality test", () => {
  it("does not reject perfectly normal-shaped data", () => {
    // Exact normal quantiles — as normal-shaped as a sample can be.
    const x = Array.from({ length: 30 }, (_, i) => normalQuantile((i + 1) / 31));
    const res = dagostinoK2(x)!;
    expect(res.p).toBeGreaterThan(0.05);
  });

  it("rejects strongly right-skewed data", () => {
    // Exponential-like growth: heavy right tail.
    const x = Array.from({ length: 40 }, (_, i) => Math.exp(i / 8));
    const res = dagostinoK2(x)!;
    expect(res.p).toBeLessThan(0.05);
  });

  it("returns null below n = 8", () => {
    expect(dagostinoK2([1, 2, 3, 4, 5])).toBeNull();
  });
});

describe("Brown–Forsythe Levene test", () => {
  const base = [-2, -1, 0, 1, 2, -2, -1, 0, 1, 2, -2, -1, 0, 1, 2];

  it("detects a 10× difference in spread", () => {
    const res = leveneBF([base, base.map((v) => v * 10)])!;
    expect(res.p).toBeLessThan(0.01);
  });

  it("passes identical spreads (location shift only)", () => {
    const res = leveneBF([base, base.map((v) => v + 5)])!;
    expect(res.p).toBeGreaterThan(0.9);
  });
});

describe("Fisher's exact test (2×2, two-sided)", () => {
  it("matches the classic tea-tasting table", () => {
    // R: fisher.test(matrix(c(3, 1, 1, 3), 2)) → p = 0.4857143
    expect(fisherExact2x2(3, 1, 1, 3)).toBeCloseTo(34 / 70, 6);
  });

  it("gives p = 1 for a perfectly balanced table", () => {
    expect(fisherExact2x2(5, 5, 5, 5)).toBeCloseTo(1, 6);
  });
});
