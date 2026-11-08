// Built-in demo datasets, each with analysis chunks that showcase it out of the box.
import type { Chunk, Dataset } from "../types";
import { birthwt } from "./birthwt";
import { cps1985 } from "./cps1985";
import { apklausa } from "./apklausa";

export interface Demo {
  id: string;
  /** Short name for the dataset picker. */
  label: string;
  dataset: Dataset;
  seed: Pick<Chunk, "testId" | "picks">[];
  /** Picks used by deep links (?demo=…&test=…) – they match the blog posts' examples. */
  examples?: Record<string, Record<string, string>>;
}

export const DEMOS: Demo[] = [
  {
    id: "birthwt",
    label: "Gimimo svoris",
    dataset: birthwt,
    seed: [
      { testId: "ttest", picks: { outcome: "bwt", group: "smoke" } },
      { testId: "chisq", picks: { rowVar: "low", colVar: "smoke" } },
      { testId: "correlation", picks: { x: "lwt", y: "bwt" } },
      { testId: "anova", picks: { outcome: "bwt", group: "race" } },
      { testId: "logistic", picks: { outcome: "low", predictors: "age,lwt,smoke" } },
    ],
  },
  {
    id: "cps1985",
    label: "Darbo užmokestis",
    dataset: cps1985,
    seed: [
      { testId: "ttest", picks: { outcome: "wage", group: "gender" } },
      { testId: "chisq", picks: { rowVar: "union", colVar: "gender" } },
      { testId: "correlation", picks: { x: "education", y: "wage" } },
      { testId: "anova", picks: { outcome: "wage", group: "occupation" } },
      { testId: "logistic", picks: { outcome: "union", predictors: "wage,gender,sector" } },
    ],
  },
  {
    id: "apklausa",
    label: "Studentų apklausa",
    dataset: apklausa,
    seed: [
      {
        testId: "table1",
        picks: { groupVar: "lytis", rowVars: JSON.stringify(["amzius", "kursas", "sritis", "dirba", "miegas"]) },
      },
      { testId: "cronbach", picks: { items: "S1,S2,S3,S4,S5,S6" } },
      { testId: "cormatrix", picks: { vars: "miegas,vidurkis,savijauta_pries,savijauta_po" } },
      { testId: "ttest", picks: { outcome: "miegas", group: "dirba" } },
      { testId: "anova", picks: { outcome: "vidurkis", group: "sritis" } },
      { testId: "chisq", picks: { rowVar: "dirba", colVar: "kursas" } },
    ],
    examples: {
      paired_ttest: { first: "savijauta_pries", second: "savijauta_po" },
      wilcoxon: { first: "savijauta_pries", second: "savijauta_po" },
      spearman: { x: "S1", y: "P1" },
      kruskal: { outcome: "S1", group: "sritis" },
      mannwhitney: { outcome: "S1", group: "lytis" },
      correlation: { x: "miegas", y: "vidurkis" },
      anova: { outcome: "S1", group: "sritis" },
      cormatrix: { vars: "miegas,vidurkis,savijauta_pries" },
      descriptives: { var: "miegas" },
      frequencies: { var: "sritis" },
    },
  },
];

export const getDemo = (id: string): Demo => DEMOS.find((d) => d.id === id) ?? DEMOS[0];
