// Shared types for the dataset model, chunks, and analysis results.

export type VariableType = "numeric" | "categorical";

export interface Variable {
  /** Column key as it appears in each row record. */
  key: string;
  /** Human-readable label shown in the UI and reports. */
  label: string;
  type: VariableType;
  /** For categorical variables: map raw value -> display label. */
  valueLabels?: Record<string, string>;
  /** Optional unit, e.g. "grams". */
  unit?: string;
}

export interface Dataset {
  name: string;
  description: string;
  variables: Variable[];
  rows: Record<string, number | string | null>[];
}

/** A column slot a test requires the user to fill in. */
export interface InputSlot {
  id: string;
  label: string;
  accepts: VariableType | "any";
  help?: string;
  /** Allow selecting multiple variables; picks serialized as comma-separated keys. */
  multi?: true;
}

export interface TestDefinition {
  id: string;
  name: string;
  /** One-line description of when to use it. */
  blurb: string;
  inputs: InputSlot[];
  run: (dataset: Dataset, picks: Record<string, string>) => AnalysisResult;
  /** One or two sentences for the Methods section of a report. */
  methods?: string;
  /** APA-formatted citation for the reference list. */
  apa?: string;
  /** Optional statistikas.lt article explaining when to use this test. */
  guide?: { title: string; url: string };
}

export interface ResultTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

export type PlotSpec =
  | { kind: "histogram"; title: string; values: number[]; xLabel: string }
  | { kind: "boxplot"; title: string; groups: { label: string; values: number[] }[]; yLabel: string }
  | { kind: "scatter"; title: string; points: { x: number; y: number }[]; xLabel: string; yLabel: string; line?: { slope: number; intercept: number } }
  | { kind: "bar"; title: string; series: { label: string; values: { x: string; y: number }[] }[]; xLabel: string; yLabel: string };

/** Outcome of one automated assumption check attached to a result. */
export interface AssumptionCheck {
  label: string;
  status: "pass" | "warn" | "fail";
  /** Plain-language explanation with the supporting statistic. */
  detail: string;
  /** Optional one-click remedy: switch this chunk to a better-suited test. */
  switchTo?: { testId: string; picks: Record<string, string>; label: string };
}

export interface AnalysisResult {
  /** Narrative interpretation in plain English (APA-ish). */
  description: string;
  tables: ResultTable[];
  plot?: PlotSpec;
  /** Headline p-value, when applicable, for quick scanning. */
  pValue?: number;
  /** Automated assumption checks with plain-language guidance. */
  assumptions?: AssumptionCheck[];
}

export interface Chunk {
  id: string;
  testId: string;
  picks: Record<string, string>;
  result?: AnalysisResult;
  error?: string;
}
