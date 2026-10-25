// CSV → string grid. Adapted from _analize-src/src/data/csv.ts.

export type Delimiter = "," | ";" | "\t";

/**
 * Guess the field delimiter from the header line: count ",", ";" and tab outside
 * quotes and pick the most frequent (default ","). Lithuanian Excel writes ";".
 */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (c === "\n" || c === "\r") break;
      if (c === "," || c === ";" || c === "\t") counts[c]++;
    }
  }
  let best: Delimiter = ",";
  for (const d of [";", "\t"] as const) if (counts[d] > counts[best]) best = d;
  return best;
}

/** Minimal CSV parser handling quoted fields and a configurable delimiter. */
export function parseCsv(text: string, delimiter: Delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows
    .map((r) => r.map((v) => v.trim()))
    .filter((r) => r.some((v) => v !== ""));
}

/** Grid from CSV text. Also reports whether "3,45" should be read as a decimal comma. */
export function gridFromCsv(text: string): { grid: string[][]; decimalComma: boolean } {
  const clean = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(clean);
  const grid = parseCsv(clean, delimiter);
  if (grid.length < 2)
    throw new Error("Faile turi būti antraščių eilutė ir bent viena duomenų eilutė.");
  // With ";" or tab as delimiter the comma is free to be the decimal mark.
  return { grid, decimalComma: delimiter !== "," };
}

/**
 * Parse a number cell. Accepts a decimal comma ("3,45"), spaces as thousands
 * separators ("1 250") and a trailing currency or percent sign. NaN if not numeric.
 */
export function parseNumber(raw: string, decimalComma: boolean): number {
  let s = raw.trim().replace(/[\s ]/g, "").replace(/[€$%]$/, "");
  if (s === "") return NaN;
  if (decimalComma) {
    if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "");
    s = s.replace(",", ".");
  }
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) ? Number(s) : NaN;
}
