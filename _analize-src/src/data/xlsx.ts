import JSZip from "jszip";
import type { Dataset } from "../types";
import { datasetFromGrid } from "./csv";

// Minimal .xlsx reader: unzips the workbook and scans the sheet XML directly,
// so it works both in the browser and in node (vitest) without a DOM.
// Reads the first worksheet only. Date-formatted cells import as Excel serial
// numbers (there is no date variable type yet).

function unescapeXml(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos|#x?[0-9a-fA-F]+);/g, (m, code: string) => {
    switch (code) {
      case "lt": return "<";
      case "gt": return ">";
      case "amp": return "&";
      case "quot": return '"';
      case "apos": return "'";
    }
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X"
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      return Number.isNaN(n) ? m : String.fromCodePoint(n);
    }
    return m;
  });
}

/** Value of attribute `name` inside an XML tag string, or null. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? unescapeXml(m[1]) : null;
}

/** "BC12" -> 0-based column index (54). */
function colIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
    else break;
  }
  return n - 1;
}

/** Concatenated text of all <t> runs inside an XML fragment. */
function textRuns(xml: string): string {
  // Drop phonetic runs (East Asian furigana) so they don't leak into values.
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) out += unescapeXml(m[1]);
  return out;
}

/** Shared-strings table: one entry per <si>, rich-text runs concatenated. */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>|<si\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ? textRuns(m[1]) : "");
  return out;
}

/** One cell's display string given its tag, inner XML, and the shared-strings table. */
function cellValue(tag: string, inner: string, sst: string[]): string {
  const t = attr(tag, "t") ?? "n";
  if (t === "inlineStr") return textRuns(inner);
  const v = inner.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
  const raw = v ? unescapeXml(v[1]) : "";
  if (t === "s") return sst[Number(raw)] ?? "";
  if (t === "b") return raw === "1" ? "TRUE" : "FALSE";
  if (t === "e") return "";
  return raw; // "n", "str", "d"
}

/** Sheet XML -> rectangular string grid with trailing empty columns trimmed. */
function parseSheetGrid(xml: string, sst: string[]): string[][] {
  const grid: string[][] = [];
  let maxCols = 0;
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  const cellRe = /(<c\b[^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const cells: string[] = [];
    if (rm[1]) {
      let cm: RegExpExecArray | null;
      let seq = 0;
      while ((cm = cellRe.exec(rm[1]))) {
        const ref = attr(cm[1], "r");
        const ci = ref ? colIndex(ref) : seq;
        while (cells.length < ci) cells.push("");
        cells[ci] = cellValue(cm[1], cm[2] ?? "", sst).trim();
        seq = ci + 1;
      }
    }
    maxCols = Math.max(maxCols, cells.length);
    grid.push(cells);
  }
  for (const r of grid) while (r.length < maxCols) r.push("");
  // Trim trailing columns that are empty everywhere, then drop all-empty rows.
  let lastCol = -1;
  for (const r of grid)
    for (let c = r.length - 1; c > lastCol; c--) if (r[c] !== "") lastCol = c;
  return grid
    .map((r) => r.slice(0, lastCol + 1))
    .filter((r) => r.some((v) => v !== ""));
}

/** Build a Dataset from .xlsx file bytes (first worksheet). */
export async function datasetFromXlsx(data: ArrayBuffer, name: string): Promise<Dataset> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("Nepavyko perskaityti failo – tai nėra tinkama .xlsx darbaknygė.");
  }
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  if (!wbXml) throw new Error("Darbaknygė nerasta – ar tai tinkamas .xlsx failas?");

  // First sheet listed in the workbook, resolved through the relationships part.
  const sheetTag = wbXml.match(/<sheet\b[^>]*\/?>/)?.[0];
  if (!sheetTag) throw new Error("Darbaknygėje nėra nė vieno lapo.");
  const rid = attr(sheetTag, "r:id");
  let target = "worksheets/sheet1.xml";
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (rid && relsXml) {
    const relRe = /<Relationship\b[^>]*\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = relRe.exec(relsXml))) {
      if (attr(m[0], "Id") === rid) {
        target = attr(m[0], "Target") ?? target;
        break;
      }
    }
  }
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const sheetXml = await zip.file(path)?.async("string");
  if (!sheetXml) throw new Error("Nepavyko perskaityti pirmojo lapo.");

  const sstXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const sst = sstXml ? parseSharedStrings(sstXml) : [];

  const grid = parseSheetGrid(sheetXml, sst);
  if (grid.length < 2)
    throw new Error("Pirmajame lape turi būti antraščių eilutė ir bent viena duomenų eilutė.");
  return datasetFromGrid(grid, name);
}
