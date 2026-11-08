import { describe, expect, it } from "vitest";
import { achievedReport, compareReport, beReport, surveyReport } from "../report";
import { sampleNTOST } from "./be";
import { power, solveN, type Spec } from "./compare";

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
      joint: null,
      pilot: null,
    });
    const lt = r.lt.replace(/ /g, " ");
    for (const piece of ["1 200", "95 %", "±5 %", "50 %", "292", "40 %", "730"]) expect(lt).toContain(piece);
    for (const piece of ["1,200", "95%", "±5%", "50%", "292", "40%", "730"]) expect(r.en).toContain(piece);
  });
  const survey = {
    formula: "cochran" as const,
    measure: "share" as const,
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
    joint: null,
    pilot: null,
  };
  it("keeps the design effect in a Paniotto report", () => {
    const r = surveyReport({ ...survey, formula: "paniotto", deff: 1.95, clusterSize: 20, icc: 0.05, n: 473 });
    expect(r.r).toContain("deff <- 1.95");
    expect(r.r).toContain("ceiling(deff / (e^2 + deff / N))");
    expect(r.lt).toContain("dizaino efektas 1,95");
    expect(r.en).toContain("design effect of 1.95");
  });
  it("names the estimate that decides, and every input of the others", () => {
    const r = surveyReport({
      ...survey,
      n: 503,
      estimates: [
        { name: "Pasitenkinimas", kind: "share", value: 0.5, margin: 0.05, n: 292 },
        { name: "Traumos", kind: "share", value: 0.1, margin: 0.02, n: 503 },
        { name: "Balas", kind: "mean", value: 15, margin: 2, n: 184 },
      ],
    });
    expect(r.lt).toContain("Traumos (tikėtina dalis 10");
    expect(r.en).toContain("Balas (SD 15, margin ±2): n = 184");
    expect(r.r).toContain("cochran(0.1 * (1 - 0.1), 0.02)");
    expect(r.r).toContain("cochran(15^2, 2)");
  });
  it("cites the pilot behind an expected share", () => {
    const r = surveyReport({ ...survey, p: 0.32, n: 262, pilot: { x: 12, n: 60, low: 0.118, high: 0.318 } });
    expect(r.en).toContain("12 of 60");
    expect(r.refs.join(" ")).toContain("Wilson");
  });
  it("describes a finished survey, not a plan", () => {
    const r = achievedReport({
      population: 1200,
      got: 180,
      confidence: 0.95,
      level: 0.95,
      joint: null,
      deff: 1,
      responseRate: 0.4,
      estimates: [{ name: "Pasitenkinimas", kind: "share", value: 0.3, margin: NaN, reached: 0.0617 }],
    });
    expect(r.lt).toContain("Gauta 180");
    expect(r.lt).not.toContain("reikia n");
    expect(r.r).toContain("fpc <- (N - n) / (N - 1)");
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

describe("one-sentence statement", () => {
  const nb = (s: string) => s.replace(/\u00a0/g, " ");
  const survey = {
    formula: "cochran" as const,
    measure: "share" as const,
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
    joint: null,
    pilot: null,
  };
  it("states a survey sample with its inputs and citation", () => {
    const { lt, en } = surveyReport(survey).statement;
    expect(nb(lt)).toBe("Reikiamas imties dydis – 292 respondentai (N = 1 200, patikimumo lygis 95 %, paklaida ±5 %, tikėtina dalis 50 %; Cochran, 1977).");
    expect(en).toBe("The required sample size was 292 respondents (N = 1,200, 95% confidence level, margin of error ±5%, expected proportion 50%; Cochran, 1977).");
    expect(en).not.toContain("[");
  });
  it("names Paniotto and cites Yamane", () => {
    const { lt, en } = surveyReport({ ...survey, formula: "paniotto", n: 300 }).statement;
    expect(lt).toContain("Paniotto formulė");
    expect(lt).not.toContain("patikimumo");
    expect(en).toContain("Yamane, 1967");
  });
  it("names the estimate that decides", () => {
    const { lt } = surveyReport({
      ...survey,
      n: 503,
      estimates: [
        { name: "Pasitenkinimas", kind: "share", value: 0.5, margin: 0.05, n: 292 },
        { name: "Traumos", kind: "share", value: 0.1, margin: 0.02, n: 503 },
      ],
    }).statement;
    expect(lt).toContain("pagal reikliausią iš 2 rodiklių („Traumos“)");
  });
  it("reports the margin a finished survey reached", () => {
    const { lt, en } = achievedReport({
      population: 1200,
      got: 180,
      confidence: 0.95,
      level: 0.95,
      joint: null,
      deff: 1,
      responseRate: 0.4,
      estimates: [{ name: "Pasitenkinimas", kind: "share", value: 0.3, margin: NaN, reached: 0.0617 }],
    }).statement;
    expect(nb(lt)).toContain("dalies įverčio paklaida ±6,2 %");
    expect(en).toContain("the margin of error for the proportion was ±6.2%");
  });
  it("states a two-group comparison", () => {
    const { lt, en } = compareReport({
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
    }).statement;
    expect(nb(lt)).toBe(
      "Reikiamas imties dydis – 128 tiriamieji (64 + 64, dviejų nepriklausomų grupių t testas, Cohen d = 0,5, dvipusis, α = 0,05, galia 80 %, įtraukiama 152, įvertinus 15 % nubyrėjimą; Cohen, 1988).",
    );
    expect(en).toContain("128 participants (64 + 64, independent-samples t test, Cohen's d = 0.5, two-sided");
  });
  it("states a TOST plan", () => {
    const { lt, en } = beReport({
      input: { alpha: 0.05, theta0: 0.95, theta1: 0.8, theta2: 1.25, cv: 0.25, design: "2x2" },
      abel: false,
      target: 0.8,
      n: 28,
      achieved: 0.8074,
      dropout: 0.1,
      enrolled: 32,
      sims: 0,
    }).statement;
    expect(nb(lt)).toBe(
      "Reikiamas imties dydis – 28 vertinami tiriamieji (2×2×2 kryžminis, TOST, CV 25 %, GMR 95 %, ribos 80–125 %, α = 0,05, galia 80 %, dozuojama 32, įvertinus 10 % pasitraukimą; Schuirmann, 1987).",
    );
    expect(en).toContain("28 evaluable subjects (2x2 design, TOST, CV 25%, GMR 95%, limits 80–125%");
  });
});
