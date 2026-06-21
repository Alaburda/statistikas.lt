import type { Dataset, Variable } from "../types";

/** Minimal CSV parser handling quoted fields and commas. */
function parseCsv(text: string): string[][] {
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
    else if (c === ",") {
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
  const grid = parseCsv(text);
  if (grid.length < 2) throw new Error("CSV needs a header row and at least one data row.");
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
      if (!Number.isNaN(Number(raw))) numericCount++;
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
      else if (v.type === "numeric") obj[v.key] = Number(raw);
      else obj[v.key] = raw;
    });
    return obj;
  });

  return {
    name,
    description: `Uploaded dataset — ${rows.length} rows, ${variables.length} columns.`,
    variables,
    rows,
  };
}
