import { describe, expect, it } from "vitest";
import { allocate, cochranN, designEffect, invitations, marginOf, meanN, nonresponseBounds, paniottoN } from "./survey";

const base = { population: null, margin: 0.05, confidence: 0.95, p: 0.5, deff: 1 };

describe("survey sample size", () => {
  it("gives the textbook 385, 1068 and 97 for a large population", () => {
    expect(cochranN(base)).toBe(385);
    expect(cochranN({ ...base, margin: 0.03 })).toBe(1068);
    expect(cochranN({ ...base, margin: 0.1 })).toBe(97);
  });
  it("applies the finite population correction", () => {
    // Krejcie & Morgan's table: N = 1000 -> 278, N = 100 -> 80.
    expect(cochranN({ ...base, population: 1000 })).toBe(278);
    expect(cochranN({ ...base, population: 100 })).toBe(80);
  });
  it("reproduces Paniotto calculations as published in Lithuanian theses", () => {
    // VU thesis example: N = 721, 7 % -> 159.06, reported as 159 before rounding up.
    expect(paniottoN(0.07, 721)).toBe(160);
    expect(paniottoN(0.05, null)).toBe(400);
    expect(paniottoN(0.05, 1200)).toBe(300);
  });
  it("a smaller population never needs more answers than it has", () => {
    for (const N of [5, 20, 60, 300]) expect(cochranN({ ...base, population: N })).toBeLessThanOrEqual(N);
  });
  it("margin of error inverts the sample size", () => {
    const n = cochranN({ ...base, population: 1200 });
    expect(marginOf(n, { ...base, population: 1200 })).toBeLessThanOrEqual(0.05);
    expect(marginOf(n - 1, { ...base, population: 1200 })).toBeGreaterThan(0.05);
    expect(marginOf(1200, { ...base, population: 1200 })).toBe(0);
  });
  it("sizes a survey of a mean", () => {
    expect(meanN(15, 2, 0.95, null, 1)).toBe(217);
  });
  it("inflates for clustering", () => {
    expect(designEffect(20, 0.05)).toBeCloseTo(1.95, 10);
    expect(cochranN({ ...base, deff: 2 })).toBe(769);
  });
});

describe("reaching the respondents", () => {
  it("converts answers into invitations", () => {
    expect(invitations(292, 0.4, 1200)).toMatchObject({ needed: 730, send: 730, possible: true, expectedAnswers: 292 });
  });
  it("flags a target that a census cannot reach", () => {
    expect(invitations(132, 0.4, 200)).toMatchObject({ possible: false, send: 200, expectedAnswers: 80 });
  });
  it("bounds the true share under nonresponse", () => {
    const [lo, hi] = nonresponseBounds(0.5, 0.4);
    expect(lo).toBeCloseTo(0.2, 10);
    expect(hi).toBeCloseTo(0.8, 10);
  });
});

describe("proportional allocation", () => {
  const strata = [
    { name: "A", size: 420 },
    { name: "B", size: 380 },
    { name: "C", size: 250 },
    { name: "D", size: 150 },
  ];
  it("adds up exactly", () => {
    for (const n of [1, 7, 100, 292, 1200]) expect(allocate(strata, n).reduce((a, b) => a + b, 0)).toBe(n);
  });
  it("stays proportional", () => {
    expect(allocate(strata, 292)).toEqual([102, 92, 61, 37]);
  });
});
