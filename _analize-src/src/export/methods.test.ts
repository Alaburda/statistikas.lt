import { describe, expect, it } from "vitest";
import { buildMethodsParagraph, buildReferences } from "./methods";
import { getTest } from "../stats/tests";
import { apklausa } from "../data/apklausa";
import { makeProject, parseProject } from "../project";
import type { Chunk } from "../types";

const run = (testId: string, picks: Record<string, string>, extra: Partial<Chunk> = {}): Chunk => ({
  id: testId,
  testId,
  picks,
  result: getTest(testId).run(apklausa, picks),
  ...extra,
});

describe("„Duomenų analizė“ paragraph", () => {
  const chunks = [
    run("cronbach", { items: "S1,S2,S4,S6" }),
    run("anova", { outcome: "vidurkis", group: "sritis" }),
    run("anova", { outcome: "miegas", group: "sritis" }),
    run("kruskal", { outcome: "S1", group: "sritis" }, { switchedFrom: "anova" }),
    { id: "x", testId: "ttest", picks: {} }, // unfinished – ignored
  ];
  const text = buildMethodsParagraph(chunks, ["Teiginiai S3 ir S5 perkoduoti atvirkščiai (1–5)."], 2026);

  it("names the software, prep steps and each test once, in report order", () => {
    expect(text.startsWith("Statistinė analizė atlikta naudojant Statistikas.lt Analizė (Statistikas.lt, 2026). Teiginiai S3")).toBe(true);
    expect(text.match(/vienfaktorė dispersinė analizė/g)).toHaveLength(1);
    expect(text.indexOf("Cronbacho")).toBeLessThan(text.indexOf("ANOVA"));
    expect(text).not.toContain("t testas");
  });

  it("reports assumption checks, substitutions and α", () => {
    expect(text).toContain("D'Agostino–Pearson");
    expect(text).toContain("Brown–Forsythe");
    expect(text).toContain("vietoje jo taikytas „Kruskal–Wallis testas“");
    expect(text.endsWith("α = 0,05.")).toBe(true);
  });

  it("lists the tool and test citations once", () => {
    const refs = buildReferences(chunks, 2026);
    expect(refs[0]).toContain("Statistikas.lt Analizė");
    expect(refs.filter((r) => r.startsWith("Cronbach"))).toHaveLength(1);
    expect(refs.some((r) => r.startsWith("Dunn"))).toBe(true);
  });

  it("is empty when nothing has run", () => {
    expect(buildMethodsParagraph([{ id: "a", testId: "ttest", picks: {} }], [], 2026)).toBe("");
  });
});

describe("project file", () => {
  it("round-trips data, prep steps and blocks", () => {
    const prep = [{ kind: "reverse" as const, id: "s1", variables: ["S3"], min: 1, max: 5 }];
    const p = parseProject(JSON.stringify(makeProject(apklausa, prep, [run("cronbach", { items: "S1,S2,S3" })])));
    expect(p.dataset.rows).toHaveLength(200);
    expect(p.prep).toEqual(prep);
    expect(p.chunks).toEqual([{ testId: "cronbach", picks: { items: "S1,S2,S3" } }]);
    expect((p.chunks[0] as Chunk).result).toBeUndefined();
  });

  it("rejects other files", () => {
    expect(() => parseProject("{}")).toThrow(/ne Statistikas/);
    expect(() => parseProject("not json")).toThrow(/sugadintas/);
  });
});
