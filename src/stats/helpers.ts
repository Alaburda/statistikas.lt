import type { Dataset, Variable } from "../types";

export function getVar(dataset: Dataset, key: string): Variable {
  const v = dataset.variables.find((x) => x.key === key);
  if (!v) throw new Error(`Nežinomas kintamasis: ${key}`);
  return v;
}

/** Display label for a categorical raw value (applies value labels if present). */
export function levelLabel(v: Variable, raw: number | string): string {
  const s = String(raw);
  return v.valueLabels?.[s] ?? s;
}

/** All non-missing numeric values for a column. */
export function numericColumn(dataset: Dataset, key: string): number[] {
  const out: number[] = [];
  for (const row of dataset.rows) {
    const val = row[key];
    if (val === null || val === undefined || val === "") continue;
    const n = typeof val === "number" ? val : Number(val);
    if (!Number.isNaN(n)) out.push(n);
  }
  return out;
}

/** Numeric outcome grouped by the levels of a categorical variable. */
export function groupNumeric(
  dataset: Dataset,
  valueKey: string,
  groupKey: string
): { label: string; raw: string; values: number[] }[] {
  const groupVar = getVar(dataset, groupKey);
  const map = new Map<string, number[]>();
  for (const row of dataset.rows) {
    const g = row[groupKey];
    const y = row[valueKey];
    if (g === null || g === undefined || g === "") continue;
    if (y === null || y === undefined || y === "") continue;
    const yn = typeof y === "number" ? y : Number(y);
    if (Number.isNaN(yn)) continue;
    const gk = String(g);
    if (!map.has(gk)) map.set(gk, []);
    map.get(gk)!.push(yn);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([raw, values]) => ({ raw, label: levelLabel(groupVar, raw), values }));
}

/** Two numeric columns, paired and filtered to rows where both are present. */
export function pairedNumeric(
  dataset: Dataset,
  xKey: string,
  yKey: string
): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (const row of dataset.rows) {
    const xv = row[xKey];
    const yv = row[yKey];
    if (xv === null || xv === undefined || xv === "") continue;
    if (yv === null || yv === undefined || yv === "") continue;
    const xn = typeof xv === "number" ? xv : Number(xv);
    const yn = typeof yv === "number" ? yv : Number(yv);
    if (Number.isNaN(xn) || Number.isNaN(yn)) continue;
    x.push(xn);
    y.push(yn);
  }
  return { x, y };
}

export function mean(a: number[]): number {
  return a.reduce((s, v) => s + v, 0) / a.length;
}

export function variance(a: number[], sample = true): number {
  if (a.length < 2) return NaN;
  const m = mean(a);
  const ss = a.reduce((s, v) => s + (v - m) ** 2, 0);
  return ss / (a.length - (sample ? 1 : 0));
}

export function sd(a: number[], sample = true): number {
  return Math.sqrt(variance(a, sample));
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function median(a: number[]): number {
  return quantile([...a].sort((x, y) => x - y), 0.5);
}
