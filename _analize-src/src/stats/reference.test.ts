// Every statistic the app reports is checked against values computed in R
// (scripts/reference.R → reference.json). A failure here means the app and R disagree.
import { describe, expect, it } from "vitest";
import reference from "./reference.json";
import { getTest } from "./tests";
import { DEMOS } from "../data/demos";
import { applyPrep, type PrepStep } from "../data/prep";
import type { Dataset } from "../types";

interface RefCase {
  id: string;
  test: string;
  dataset: string;
  picks: Record<string, string>;
  expect: Record<string, number>;
  prep?: PrepStep[];
}

const datasets: Record<string, Dataset> = Object.fromEntries(DEMOS.map((d) => [d.id, d.dataset]));

/** Agreement to 4 decimals, relative for large magnitudes. */
function close(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 1e-4 * Math.max(1, Math.abs(expected));
}

describe("statistics match R", () => {
  for (const c of reference as unknown as RefCase[]) {
    it(`${c.id} (${c.test})`, () => {
      expect(datasets[c.dataset], `unknown dataset ${c.dataset}`).toBeDefined();
      const prep = applyPrep(datasets[c.dataset], c.prep ?? []);
      expect(prep.errors.filter(Boolean)).toEqual([]);
      const ds = prep.dataset;
      const stats = getTest(c.test).run(ds, c.picks).stats ?? {};
      const mismatches = Object.entries(c.expect)
        .filter(([k, v]) => !(k in stats) || !close(stats[k], v))
        .map(([k, v]) => `${k}: app ${stats[k]} vs R ${v}`);
      expect(mismatches).toEqual([]);
    });
  }
});
