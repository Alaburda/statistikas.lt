import type { VariableType } from "../types";

/** Lithuanian display names for variable types. */
export const TYPE_LABEL: Record<VariableType, string> = {
  numeric: "kiekybinis",
  categorical: "kategorinis",
};

export const typeLabel = (t: VariableType | "any"): string =>
  t === "any" ? "bet koks tipas" : TYPE_LABEL[t];
