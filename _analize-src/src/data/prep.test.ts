import { describe, expect, it } from "vitest";
import { applyPrep, type PrepStep } from "./prep";
import { apklausa } from "./apklausa";
import type { Dataset } from "../types";

const tiny: Dataset = {
  name: "t",
  description: "",
  variables: [
    { key: "a", label: "A", type: "numeric" },
    { key: "b", label: "B", type: "numeric" },
    { key: "g", label: "Grupė", type: "categorical", valueLabels: { "1": "Vyras", "2": "Moteris" } },
  ],
  rows: [
    { a: 1, b: 5, g: 1 },
    { a: 2, b: null, g: 2 },
    { a: 5, b: 4, g: 2 },
    { a: null, b: null, g: 1 },
  ],
};

describe("prep pipeline", () => {
  it("reverse-codes in place and never mutates the raw data", () => {
    const { dataset, sentences } = applyPrep(tiny, [{ kind: "reverse", id: "1", variables: ["a"], min: 1, max: 5 }]);
    expect(dataset.rows.map((r) => r.a)).toEqual([5, 4, 1, null]);
    expect(tiny.rows[0].a).toBe(1);
    expect(sentences[0]).toBe("Teiginys A perkoduotas atvirkščiai (1–5).");
  });

  it("computes a mean score with a minimum of valid items", () => {
    const steps: PrepStep[] = [
      { kind: "compute", id: "1", target: "sk", label: "Skalė", items: ["a", "b"], fn: "mean", minValid: 1 },
    ];
    const { dataset } = applyPrep(tiny, steps);
    expect(dataset.rows.map((r) => r.sk)).toEqual([3, 2, 4.5, null]);
    expect(dataset.variables[dataset.variables.length - 1]).toMatchObject({ key: "sk", type: "numeric" });
  });

  it("recodes ranges into a new categorical variable", () => {
    const { dataset } = applyPrep(tiny, [
      {
        kind: "recode", id: "1", variable: "a", target: "ag", label: "A grupės",
        rules: [{ from: 1, to: 2, group: "Žema" }, { from: 3, group: "Aukšta" }],
      },
    ]);
    expect(dataset.rows.map((r) => r.ag)).toEqual(["1", "1", "2", null]);
    expect(dataset.variables[dataset.variables.length - 1].valueLabels).toEqual({ "1": "Žema", "2": "Aukšta" });
  });

  it("filters cases and reports n", () => {
    const { dataset, sentences } = applyPrep(tiny, [{ kind: "filter", id: "1", variable: "g", op: "==", value: "2" }]);
    expect(dataset.rows).toHaveLength(2);
    expect(sentences[0]).toContain("Moteris");
    expect(sentences[0]).toContain("n = 2 iš 4");
  });

  it("a broken step is skipped and reported, later steps still run", () => {
    const { dataset, errors } = applyPrep(tiny, [
      { kind: "compute", id: "1", target: "a", label: "", items: ["a", "b"], fn: "mean", minValid: 1 },
      { kind: "reverse", id: "2", variables: ["b"], min: 1, max: 5 },
    ]);
    expect(errors[0]).toMatch(/jau yra/);
    expect(errors[1]).toBeNull();
    expect(dataset.rows[0].b).toBe(1);
  });

  it("builds the stress scale of the survey demo", () => {
    const items = ["S1", "S2", "S3", "S4", "S5", "S6"];
    const { dataset, errors } = applyPrep(apklausa, [
      { kind: "reverse", id: "1", variables: ["S3", "S5"], min: 1, max: 5 },
      { kind: "compute", id: "2", target: "stresas", label: "Stresas", items, fn: "mean", minValid: 5 },
    ]);
    expect(errors).toEqual([null, null]);
    const scores = dataset.rows.map((r) => r.stresas as number | null);
    expect(scores.every((s) => s === null || (s >= 1 && s <= 5))).toBe(true);
  });
});
