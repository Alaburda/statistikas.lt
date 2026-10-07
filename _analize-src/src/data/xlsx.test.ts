import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { datasetFromXlsx } from "./xlsx";

/** Build a minimal in-memory .xlsx with shared strings, inline strings, and gaps. */
async function makeWorkbook(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">
  <si><t>name</t></si><si><t>score</t></si><si><t>Alice &amp; co</t></si><si><r><t>Bo</t></r><r><t>b</t></r></si>
</sst>`
  );
  // Row 3 leaves B blank (missing value); row 4 uses an inline string.
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>91.5</v></c></row>
    <row r="3"><c r="A3" t="s"><v>3</v></c></row>
    <row r="4"><c r="A4" t="inlineStr"><is><t>Cara</t></is></c><c r="B4"><v>78</v></c></row>
  </sheetData>
</worksheet>`
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("datasetFromXlsx", () => {
  it("parses shared strings, rich text, inline strings, and blanks", async () => {
    const ds = await datasetFromXlsx(await makeWorkbook(), "demo");
    expect(ds.variables.map((v) => v.key)).toEqual(["name", "score"]);
    expect(ds.variables[1].type).toBe("numeric");
    expect(ds.rows).toEqual([
      { name: "Alice & co", score: 91.5 },
      { name: "Bob", score: null },
      { name: "Cara", score: 78 },
    ]);
  });

  it("rejects files that are not xlsx", async () => {
    const bytes = new TextEncoder().encode("just,a,csv").buffer as ArrayBuffer;
    await expect(datasetFromXlsx(bytes, "nope")).rejects.toThrow(/tinkama \.xlsx/);
  });
});
