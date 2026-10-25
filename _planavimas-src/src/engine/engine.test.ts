import { describe, expect, it } from "vitest";
import { accuracy, abcClasses, demandClass, seasonalTest, xyzClass } from "./classify";
import { guessMapping, prepare } from "./dataset";
import { priceElasticity } from "./elasticity";
import { autoEts, croston, ets, naive, seasonalNaive, theta, tsb } from "./models";
import { detectFreq, parseDate, periodLabel, periodOf, dayFromYmd, detectDateOrder } from "./periods";
import { findAnomalies, forecastSeries, promoBaseline } from "./pipeline";
import { EMPTY_INPUTS, inventory, itemPlan, totals } from "./plan";
import { auditChecks } from "./audit";
import { demoGrid } from "../data/demo";
import { parseNumber } from "../data/csv";

// Reference values below come from R's forecast package (v8.x); see the comments.
const AIR = [
  112, 118, 132, 129, 121, 135, 148, 148, 136, 119, 104, 118, 115, 126, 141, 135, 125, 149, 170, 170, 158, 133, 114, 140,
  145, 150, 178, 163, 172, 178, 199, 199, 184, 162, 146, 166, 171, 180, 193, 181, 183, 218, 230, 242, 209, 191, 172, 194,
  196, 196, 236, 235, 229, 243, 264, 272, 237, 211, 180, 201, 204, 188, 235, 227, 234, 264, 302, 293, 259, 229, 203, 229,
  242, 233, 267, 269, 270, 315, 364, 347, 312, 274, 237, 278, 284, 277, 317, 313, 318, 374, 413, 405, 355, 306, 271, 306,
  315, 301, 356, 348, 355, 422, 465, 467, 404, 347, 305, 336, 340, 318, 362, 348, 363, 435, 491, 505, 404, 359, 310, 337,
  360, 342, 406, 396, 420, 472, 548, 559, 463, 407, 362, 405, 417, 391, 419, 461, 472, 535, 622, 606, 508, 461, 390, 432,
];

describe("periods", () => {
  it("parses the common date spellings", () => {
    const d = dayFromYmd(2024, 3, 5);
    expect(parseDate("2024-03-05")).toBe(d);
    expect(parseDate("2024-03-05 13:45:00")).toBe(d);
    expect(parseDate("2024.03.05")).toBe(d);
    expect(parseDate("05.03.2024")).toBe(d);
    expect(parseDate("03/05/2024", "mdy")).toBe(d);
    expect(parseDate("45356")).toBe(d); // Excel serial
    expect(parseDate("2024-03")).toBe(dayFromYmd(2024, 3, 1));
    expect(parseDate("2024-W10")).toBe(dayFromYmd(2024, 3, 4));
    expect(parseDate("2024-02-30")).toBeNull();
    expect(parseDate("abc")).toBeNull();
  });
  it("detects month-first dates only when day-first is impossible", () => {
    expect(detectDateOrder(["03/05/2024", "12/25/2024"])).toBe("mdy");
    expect(detectDateOrder(["03/05/2024", "25/12/2024"])).toBe("dmy");
  });
  it("labels ISO weeks and months", () => {
    expect(periodLabel(periodOf(dayFromYmd(2024, 3, 6), "week"), "week")).toBe("2024-W10");
    expect(periodLabel(periodOf(dayFromYmd(2021, 1, 3), "week"), "week")).toBe("2020-W53");
    expect(periodLabel(periodOf(dayFromYmd(2024, 3, 6), "month"), "month")).toBe("2024-03");
  });
  it("detects the frequency", () => {
    const start = dayFromYmd(2024, 1, 1);
    expect(detectFreq([0, 1, 2, 3, 5].map((k) => start + k))).toBe("day");
    expect(detectFreq([0, 7, 14, 28].map((k) => start + k))).toBe("week");
    expect(detectFreq([0, 31, 60, 91].map((k) => start + k))).toBe("month");
  });
});

describe("csv numbers", () => {
  it("reads decimal commas and thousands separators", () => {
    expect(parseNumber("3,45", true)).toBe(3.45);
    expect(parseNumber("1 250,5", true)).toBe(1250.5);
    expect(parseNumber("1.250,5", true)).toBe(1250.5);
    expect(parseNumber("12,5 €", true)).toBe(12.5);
    expect(parseNumber("3.45", false)).toBe(3.45);
    expect(Number.isNaN(parseNumber("abc", false))).toBe(true);
  });
});

describe("models", () => {
  it("naive and seasonal naive", () => {
    expect(naive([1, 2, 3], 2).forecast).toEqual([3, 3]);
    expect(seasonalNaive(AIR, 12, 12).forecast[0]).toBe(417); // R: snaive → 417
  });
  it("Croston matches forecast::croston", () => {
    const y = [0, 0, 3, 0, 5, 0, 0, 0, 2, 4, 0, 0, 6, 0, 0, 1, 0, 3, 0, 0];
    expect(croston(y, 3, 0.1).forecast[0]).toBeCloseTo(1.154895, 5); // R: croston(y, alpha = 0.1)
  });
  it("SES on a constant series forecasts the constant", () => {
    const f = ets(new Array(30).fill(50), 5, "N", "N", 1);
    expect(f.forecast[4]).toBeCloseTo(50, 6);
  });
  it("Holt recovers a straight line", () => {
    const y = Array.from({ length: 40 }, (_, t) => 10 + 2 * t);
    const f = ets(y, 3, "A", "N", 1);
    expect(f.forecast[0]).toBeCloseTo(90, 1);
    expect(f.forecast[2]).toBeCloseTo(94, 1);
  });
  it("AutoETS on AirPassengers is close to R's ets()", () => {
    // R: ets(AirPassengers) → ETS(M,Ad,M), forecast h=1: 441.8, h=12: 452.0.
    // Ours is additive-error with heuristic initial states, so allow ±5 %.
    const f = autoEts(AIR, 12, 12, true);
    expect(f.season).toBe("M");
    expect(Math.abs(f.forecast[0] / 441.8 - 1)).toBeLessThan(0.05);
    expect(Math.abs(f.forecast[11] / 452.0 - 1)).toBeLessThan(0.06);
  });
  it("Theta on AirPassengers is close to R's thetaf()", () => {
    // R: thetaf(AirPassengers, h = 12)$mean[c(1, 12)] → 440.1, 447.6
    const f = theta(AIR, 12, 12, true);
    expect(Math.abs(f.forecast[0] / 440.08 - 1)).toBeLessThan(0.03);
    expect(Math.abs(f.forecast[11] / 447.64 - 1)).toBeLessThan(0.03);
  });
  it("TSB forecasts the demand rate", () => {
    const y = Array.from({ length: 100 }, (_, t) => (t % 4 === 0 ? 8 : 0));
    const f = tsb(y, 1).forecast[0];
    expect(f).toBeGreaterThan(1.2);
    expect(f).toBeLessThan(3.2);
  });
});

describe("classification and accuracy", () => {
  it("finds AirPassengers seasonal and a flat series not", () => {
    expect(seasonalTest(AIR, 12).seasonal).toBe(true);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const flat = Array.from({ length: 60 }, () => 100 + 10 * (rnd() - 0.5));
    expect(seasonalTest(flat, 12).seasonal).toBe(false);
  });
  it("classifies demand patterns", () => {
    expect(demandClass([10, 11, 9, 10, 12, 10]).cls).toBe("smooth");
    expect(demandClass([0, 0, 5, 0, 0, 6, 0, 0, 5, 0]).cls).toBe("intermittent");
    expect(demandClass([0, 0, 1, 0, 0, 20, 0, 0, 3, 0]).cls).toBe("lumpy");
    expect(demandClass([0, 0, 1, 0]).cls).toBe("sparse");
  });
  it("ABC and XYZ", () => {
    // An item takes the class in which its cumulative share starts (0 %, 70 %, 90 %, 96 %).
    expect(abcClasses([70, 20, 6, 4])).toEqual(["A", "A", "B", "C"]);
    expect(xyzClass([10, 10, 11, 9]).cls).toBe("X");
  });
  it("accuracy measures", () => {
    const a = accuracy([10, 20], [12, 16], [1, 2, 3, 4], 1);
    expect(a.mae).toBe(3);
    expect(a.wape).toBeCloseTo(0.2);
    expect(a.bias).toBeCloseTo(-2 / 30);
    expect(a.mase).toBe(3);
  });
});

describe("promotions, anomalies, elasticity", () => {
  it("interpolates promotion periods out of the baseline", () => {
    expect(promoBaseline([10, 30, 12], [false, true, false])).toEqual([10, 11, 12]);
  });
  it("flags a spike", () => {
    const y = Array.from({ length: 40 }, (_, t) => 100 + (t % 3));
    y[20] = 1000;
    const a = findAnomalies(y, null, 4);
    expect(a.map((x) => x.t)).toEqual([20]);
  });
  it("recovers a known elasticity", () => {
    const price: number[] = [];
    const y: number[] = [];
    for (let t = 0; t < 80; t++) {
      const p = 10 * (1 + 0.15 * Math.sin(t / 3)) * (t % 7 === 0 ? 0.8 : 1);
      price.push(p);
      y.push(1000 * Math.pow(p, -1.5) * (1 + 0.03 * Math.sin(t * 1.7)));
    }
    const e = priceElasticity(y, price, null, 12)!;
    expect(e.estimate).toBeCloseTo(-1.5, 1);
    expect(e.lower).toBeLessThan(-1.5);
    expect(e.upper).toBeGreaterThan(-1.5);
  });
});

describe("demo end to end", () => {
  const grid = demoGrid();
  const map = guessMapping(grid[0], grid.slice(1), false);
  it("guesses the columns", () => {
    expect(map).toEqual({ date: 0, item: 1, group: 2, qty: 3, price: 4, promo: 5 });
  });
  const prep = prepare(grid, map, false, null);
  it("builds weekly series with gaps filled", () => {
    expect(prep.freq).toBe("week");
    expect(prep.series.length).toBe(18);
    expect(prep.issues.duplicates.length).toBe(1);
    const spare = prep.series.find((s) => s.item === "Atsarginė dalis X-310")!;
    expect(spare.filled).toBeGreaterThan(50);
  });
  const opts = { horizon: 13, m: 52, maWindow: 4, sdHorizon: 26, model: "auto" as const, cleanAnomalies: true };
  const results = prep.series.map((s) => forecastSeries(s, opts));
  it("forecasts every item with sane numbers", () => {
    for (const r of results) {
      expect(r.forecast.length).toBe(13);
      expect(r.forecast.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
      expect(r.sd.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
    }
    const spare = results.find((r) => r.item === "Atsarginė dalis X-200")!;
    expect(["intermittent", "lumpy"]).toContain(spare.cls);
    expect(["croston", "sba", "tsb", "ma", "naive"]).toContain(spare.model);
    const water = results.find((r) => r.item === "Mineralinis vanduo 1,5 l")!;
    expect(water.anomalies.length).toBeGreaterThanOrEqual(1);
    const coffee = results.find((r) => r.item === "Kava, pupelės 1 kg")!;
    expect(coffee.promoUplift).toBeGreaterThan(1.2);
    expect(coffee.elasticity!.estimate).toBeLessThan(-0.8);
  });
  it("audits the demo", () => {
    const checks = auditChecks(prep, results, 52);
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(byId.duplicates.status).toBe("warn");
    expect(byId.stopped.count).toBeGreaterThanOrEqual(1);
    expect(byId.anomalies.count).toBeGreaterThanOrEqual(1);
  });
  it("plans, totals and inventory", () => {
    const r = results[0];
    const inp = { ...EMPTY_INPUTS, adjust: { [r.item]: 10 }, onHand: { [r.item]: 0 } };
    const plan = itemPlan(r, inp);
    expect(plan[0]).toBeCloseTo(r.forecast[0] * 1.1);
    const inv = inventory(r, plan, inp);
    expect(inv.safetyStock).toBeGreaterThan(0);
    expect(inv.reorderPoint).toBeCloseTo(inv.leadDemand + inv.safetyStock);
    expect(inv.order).toBeGreaterThan(inv.reorderPoint);
    const tot = totals(results, EMPTY_INPUTS, prep.last, 0.8);
    expect(tot.plan[0]).toBeCloseTo(results.reduce((s, x) => s + x.forecast[0], 0));
    expect(tot.history.length).toBe(156);
  });
});
