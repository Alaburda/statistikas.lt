import type { Dataset, Variable } from "../types";
import { ltPlural } from "../stats/format";

type Delimiter = "," | ";" | "\t";

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
function parseCsv(text: string, delimiter: Delimiter = ","): string[][] {
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
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

/** Build a Dataset from raw CSV text, inferring numeric vs categorical per column. */
export function datasetFromCsv(text: string, name: string): Dataset {
  const clean = text.replace(/^\uFEFF/, ""); // strip UTF-8 BOM
  const delimiter = detectDelimiter(clean);
  const grid = parseCsv(clean, delimiter);
  if (grid.length < 2)
    throw new Error("CSV faile turi būti antraščių eilutė ir bent viena duomenų eilutė.");
  // With ";" or tab as delimiter the comma is free to be the decimal mark ("3,45").
  return datasetFromGrid(grid, name, delimiter !== ",");
}

/** Parse a cell as a number; with `decimalComma`, "3,45" is read as 3.45. NaN if not numeric. */
function parseNumber(raw: string, decimalComma: boolean): number {
  if (decimalComma && /^[+-]?(\d+,\d*|,\d+)([eE][+-]?\d+)?$/.test(raw)) {
    return Number(raw.replace(",", "."));
  }
  return Number(raw);
}

/**
 * Build a Dataset from a string grid (header + data rows), inferring numeric vs categorical per column.
 * `decimalComma` additionally accepts "3,45" as a number (for ";"/tab separated files).
 */
export function datasetFromGrid(grid: string[][], name: string, decimalComma = false): Dataset {
  if (grid.length < 2)
    throw new Error("Duomenyse turi būti antraščių eilutė ir bent viena duomenų eilutė.");
  const header = grid[0];
  const dataRows = grid.slice(1);

  const variables: Variable[] = header.map((key, ci) => {
    let numericCount = 0;
    let present = 0;
    const distinct = new Set<string>();
    for (const r of dataRows) {
      const raw = (r[ci] ?? "").trim();
      if (raw === "") continue;
      present++;
      distinct.add(raw);
      if (!Number.isNaN(parseNumber(raw, decimalComma))) numericCount++;
    }
    // Numeric if (nearly) all values parse as numbers AND it isn't a small-integer code set.
    const mostlyNumeric = present > 0 && numericCount / present > 0.9;
    const looksCategorical = distinct.size <= 10 && distinct.size > 0 && present / distinct.size > 3;
    const type: Variable["type"] = mostlyNumeric && !looksCategorical ? "numeric" : "categorical";
    return { key, label: key, type };
  });

  const rows = dataRows.map((r) => {
    const obj: Record<string, number | string | null> = {};
    variables.forEach((v, ci) => {
      const raw = (r[ci] ?? "").trim();
      if (raw === "") obj[v.key] = null;
      else if (v.type === "numeric") obj[v.key] = parseNumber(raw, decimalComma);
      else obj[v.key] = raw;
    });
    return obj;
  });

  return {
    name,
    description:
      `Įkeltas duomenų rinkinys: ${rows.length} ${ltPlural(rows.length, ["eilutė", "eilutės", "eilučių"])}, ` +
      `${variables.length} ${ltPlural(variables.length, ["stulpelis", "stulpeliai", "stulpelių"])}.`,
    variables,
    rows,
  };
}
