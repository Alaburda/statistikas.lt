import { describe, expect, it } from "vitest";
import { datasetFromCsv } from "./csv";
import { fmt, fmtP, fmtPct, ltPlural, significanceNote } from "../stats/format";

describe("datasetFromCsv", () => {
  it("parses comma-separated CSV with quotes", () => {
    const ds = datasetFromCsv('name,score\n"Smith, J",1.5\nBob,2.5\nCara,3\n', "t");
    expect(ds.variables.map((v) => v.key)).toEqual(["name", "score"]);
    expect(ds.variables[1].type).toBe("numeric");
    expect(ds.rows[0]).toEqual({ name: "Smith, J", score: 1.5 });
    expect(ds.rows).toHaveLength(3);
    expect(ds.description).toBe("Įkeltas duomenų rinkinys: 3 eilutės, 2 stulpeliai.");
  });

  it("parses semicolon-separated CSV with decimal commas", () => {
    const ds = datasetFromCsv("vardas;ūgis;svoris\nAnas;1,75;70,5\nBirutė;1,6;55\nCezaris;1,82;81,25\n", "t");
    expect(ds.variables.map((v) => v.key)).toEqual(["vardas", "ūgis", "svoris"]);
    expect(ds.variables[1].type).toBe("numeric");
    expect(ds.variables[2].type).toBe("numeric");
    expect(ds.rows.map((r) => r["ūgis"])).toEqual([1.75, 1.6, 1.82]);
    expect(ds.rows.map((r) => r["svoris"])).toEqual([70.5, 55, 81.25]);
  });

  it("parses tab-separated data", () => {
    const ds = datasetFromCsv("a\tb\n1\t2,5\n3\t4,5\n5\t6,5\n", "t");
    expect(ds.variables.map((v) => v.key)).toEqual(["a", "b"]);
    expect(ds.rows.map((r) => r.b)).toEqual([2.5, 4.5, 6.5]);
    expect(ds.variables[1].type).toBe("numeric");
  });

  it("strips a UTF-8 BOM from the header", () => {
    const ds = datasetFromCsv("﻿x,y\n1,2\n2,4\n3,9\n", "t");
    expect(ds.variables[0].key).toBe("x");
    expect(ds.rows[2]).toEqual({ x: 3, y: 9 });
  });

  it("keeps decimal-point numbers in comma CSV", () => {
    const ds = datasetFromCsv("x,y\n1.5,a\n2.5,b\n3.5,c\n", "t");
    expect(ds.rows.map((r) => r.x)).toEqual([1.5, 2.5, 3.5]);
  });

  it("rejects input with no data rows", () => {
    expect(() => datasetFromCsv("a,b\n", "t")).toThrow(/duomenų eilutė/);
  });
});

describe("Lithuanian formatting helpers", () => {
  it("ltPlural", () => {
    const f: [string, string, string] = ["eilutė", "eilutės", "eilučių"];
    expect([1, 2, 5, 9, 10, 11, 12, 19, 20, 21, 22, 101, 111, 112].map((n) => ltPlural(n, f))).toEqual([
      "eilutė", "eilutės", "eilutės", "eilutės", "eilučių", "eilučių", "eilučių", "eilučių", "eilučių",
      "eilutė", "eilutės", "eilutė", "eilučių", "eilučių",
    ]);
  });
  it("fmt / fmtP / fmtPct / significanceNote", () => {
    expect(fmt(3.456)).toBe("3,46");
    expect(fmt(4)).toBe("4");
    expect(fmtP(0.034)).toBe("0,034");
    expect(fmtP(0.0004)).toBe("< 0,001");
    expect(fmtPct(12.5)).toBe("12,5 %");
    expect(significanceNote(0.01)).toBe("statistiškai reikšmingas (α = 0,05)");
    expect(significanceNote(0.2)).toBe("statistiškai nereikšmingas (α = 0,05)");
  });
});
