import { describe, expect, it } from "vitest";
import { compareReport, beReport, surveyReport } from "../report";
import { CHECKS } from "../components/Verified";
import { sampleNTOST } from "./be";
import { power, solveN, type Spec } from "./compare";
import ref from "./reference.json";

describe("the numbers quoted on the page", () => {
  it("match the size of the reference grids", () => {
    expect(ref.tost.length + ref.tostLimits.length).toBe(CHECKS.tost);
    const compare =
      ref.means.length + ref.meansUnequal.length + ref.paired.length + ref.props.length + ref.anova.length + ref.corr.length;
    expect(compare).toBe(CHECKS.compare);
    expect(ref.abel.length + ref.abelPower.length).toBe(CHECKS.abel);
  });
});

describe("known answers", () => {
  it("d = 0.5 needs 64 per group", () => {
    const spec: Spec = { kind: "means", delta: 5, sd: 10, ratio: 1 };
    expect(solveN(spec, { alpha: 0.05, sides: 2 }, 0.8)).toBe(64);
  });
  it("CV 25 %, GMR 0.95 needs 28 subjects in a 2×2", () => {
    const res = sampleNTOST({ alpha: 0.05, theta0: 0.95, theta1: 0.8, theta2: 1.25, cv: 0.25, design: "2x2" }, 0.8);
    expect(res?.n).toBe(28);
    expect(res?.power).toBeCloseTo(0.807439, 5);
  });
  it("a 4 % vs 4.8 % A/B test needs about 11 thousand per arm", () => {
    const spec: Spec = { kind: "props", p1: 0.04, p2: 0.048, ratio: 1 };
    const n = solveN(spec, { alpha: 0.05, sides: 2 }, 0.8)!;
    expect(n).toBeGreaterThan(10000);
    expect(n).toBeLessThan(12000);
    expect(power(spec, { alpha: 0.05, sides: 2 }, n)).toBeGreaterThanOrEqual(0.8);
  });
});

describe("report text", () => {
  it("spells out every input of a survey", () => {
    const r = surveyReport({
      formula: "cochran",
      measure: "share",
      population: 1200,
      margin: 0.05,
      confidence: 0.95,
      p: 0.5,
      sd: 0,
      deff: 1,
      clusterSize: null,
      icc: null,
      n: 292,
      responseRate: 0.4,
      send: 730,
      possible: true,
      expectedAnswers: 292,
    });
    const lt = r.lt.replace(/ /g, " ");
    for (const piece of ["1 200", "95 %", "±5 %", "50 %", "292", "40 %", "730"]) expect(lt).toContain(piece);
    for (const piece of ["1,200", "95%", "±5%", "50%", "292", "40%", "730"]) expect(r.en).toContain(piece);
  });
  it("gives R code that names the exact call", () => {
    const r = compareReport({
      spec: { kind: "means", delta: 5, sd: 10, ratio: 1 },
      test: { alpha: 0.05, sides: 2 },
      alphaPlain: 0.05,
      comparisons: 1,
      target: 0.8,
      groups: [64, 64],
      achieved: 0.8015,
      rank: false,
      dropout: 0.15,
      enrolled: [76, 76],
      abTest: false,
      or: null,
    });
    expect(r.r).toContain("pwr.t.test(d = 0.5, power = 0.8, sig.level = 0.05");
    expect(r.lt).toContain("64 + 64 = 128");
    expect(r.lt).toContain("tiriamųjų");
    expect(r.lt).toContain("152");
    expect(r.gpower).toContain("Allocation ratio N2/N1 = 1");
  });
  it("describes a TOST plan", () => {
    const r = beReport({
      input: { alpha: 0.05, theta0: 0.95, theta1: 0.8, theta2: 1.25, cv: 0.25, design: "2x2" },
      abel: false,
      target: 0.8,
      n: 28,
      achieved: 0.8074,
      dropout: 0.1,
      enrolled: 32,
      sims: 0,
    });
    expect(r.r).toContain('sampleN.TOST(CV = 0.25, theta0 = 0.95, theta1 = 0.8, theta2 = 1.25');
    expect(r.en).toContain("28 subjects");
    expect(r.en).toContain("32 subjects will be dosed");
  });
});
