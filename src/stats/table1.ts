import type { Dataset } from "../types";
import { getVar, levelLabel, mean, sd } from "./helpers";
import { fmt, fmtPct } from "./format";

export interface Table1Row {
  label: string;
  cells: string[];
  indent: boolean;
  bold: boolean;
}

export interface Table1Data {
  groupHeaders: string[];
  nRow: string[];
  rows: Table1Row[];
}

type Slice = Record<string, number | string | null>[];

function numericCell(rows: Slice, varKey: string): string {
  const vals: number[] = [];
  for (const row of rows) {
    const val = row[varKey];
    if (val === null || val === undefined || val === "") continue;
    const n = typeof val === "number" ? val : Number(val);
    if (!isNaN(n)) vals.push(n);
  }
  if (vals.length === 0) return "—";
  return `${fmt(mean(vals))} (${fmt(sd(vals))})`;
}

function catCell(rows: Slice, varKey: string, levelRaw: string): string {
  let count = 0;
  let denom = 0;
  for (const row of rows) {
    const val = row[varKey];
    if (val === null || val === undefined || val === "") continue;
    denom++;
    if (String(val) === levelRaw) count++;
  }
  if (denom === 0) return "—";
  return `${count} (${fmtPct((100 * count) / denom, 1)})`;
}

export function computeTable1(
  dataset: Dataset,
  groupVarKey: string | null,
  rowVarKeys: string[],
  showTotal: boolean
): Table1Data {
  const groups: { label: string; rows: Slice }[] = [];
  let validRows: Slice = dataset.rows;

  if (groupVarKey) {
    const gv = getVar(dataset, groupVarKey);
    const byLevel = new Map<string, Slice>();
    validRows = [];
    for (const row of dataset.rows) {
      const val = row[groupVarKey];
      if (val === null || val === undefined || val === "") continue;
      validRows.push(row);
      const k = String(val);
      if (!byLevel.has(k)) byLevel.set(k, []);
      byLevel.get(k)!.push(row);
    }
    for (const raw of [...byLevel.keys()].sort()) {
      groups.push({ label: levelLabel(gv, raw), rows: byLevel.get(raw)! });
    }
  }

  const totalN = validRows.length;
  const groupHeaders: string[] = [];
  const nRow: string[] = [];

  if (groups.length > 0) {
    for (const g of groups) {
      groupHeaders.push(g.label);
      const pct = totalN > 0 ? fmtPct((100 * g.rows.length) / totalN, 1) : "—";
      nRow.push(`n = ${g.rows.length} (${pct})`);
    }
    if (showTotal) {
      groupHeaders.push("Iš viso");
      nRow.push(`N = ${totalN}`);
    }
  } else {
    groupHeaders.push("Visa imtis");
    nRow.push(`N = ${totalN}`);
  }

  // Columns to compute: group slices + optional total
  const slices: Slice[] =
    groups.length > 0
      ? [...groups.map((g) => g.rows), ...(showTotal ? [validRows] : [])]
      : [validRows];

  const rows: Table1Row[] = [];

  for (const varKey of rowVarKeys) {
    const v = getVar(dataset, varKey);

    if (v.type === "numeric") {
      rows.push({
        label: `${v.label}${v.unit ? `, ${v.unit}` : ""}, vidurkis (SN)`,
        cells: slices.map((s) => numericCell(s, varKey)),
        indent: false,
        bold: false,
      });
    } else {
      // Categorical: bold header row + one indented row per level
      rows.push({
        label: v.label,
        cells: slices.map(() => ""),
        indent: false,
        bold: true,
      });

      const allLevels = new Set<string>();
      for (const row of dataset.rows) {
        const val = row[varKey];
        if (val !== null && val !== undefined && val !== "") {
          allLevels.add(String(val));
        }
      }

      for (const raw of [...allLevels].sort()) {
        rows.push({
          label: levelLabel(v, raw),
          cells: slices.map((s) => catCell(s, varKey, raw)),
          indent: true,
          bold: false,
        });
      }
    }
  }

  return { groupHeaders, nRow, rows };
}
