// Built-in demo datasets, each with analysis chunks that showcase it out of the box.
import type { Chunk, Dataset } from "../types";
import { birthwt } from "./birthwt";
import { cps1985 } from "./cps1985";

export interface Demo {
  id: string;
  /** Short name for the dataset picker. */
  label: string;
  dataset: Dataset;
  seed: Pick<Chunk, "testId" | "picks">[];
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
];

export const getDemo = (id: string): Demo => DEMOS.find((d) => d.id === id) ?? DEMOS[0];
