import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { saveAs } from "file-saver";
import type { Chunk, Dataset, ResultTable } from "../types";
import type { Theme } from "../theme";
import { DEFAULT_THEME } from "../theme";
import { getTest } from "../stats/tests";
import { renderPlotSvg, PLOT_HEIGHT, PLOT_WIDTH } from "../charts/svg";
import { CONTACT_EMAIL, SITE_URL } from "../site";

// Site ink tones (hex without #, as docx expects).
const INK_2 = "4A4741";
const INK_3 = "6B675F";

/** Rasterise an SVG string to PNG bytes via an offscreen canvas (2× for clarity). */
function svgToPng(svg: string, scale = 2): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = PLOT_WIDTH * scale;
      canvas.height = PLOT_HEIGHT * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return reject(new Error("Diagramos eksportas nepavyko"));
        b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nepavyko paversti diagramos į paveikslėlį"));
    };
    img.src = url;
  });
}

const hex = (c: string) => c.replace(/^#/, "");

function buildTable(t: ResultTable, theme: Theme): Table {
  const header = new TableRow({
    tableHeader: true,
    children: t.columns.map(
      (c) =>
        new TableCell({
          shading: { fill: hex(theme.ui.thBg) },
          children: [
            new Paragraph({
              children: [new TextRun({ text: String(c), bold: true, color: hex(theme.ui.thText) })],
            }),
          ],
        })
    ),
  });
  const body = t.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(cell) })] })],
            })
        ),
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...body],
  });
}

function dateStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function exportToWord(
  dataset: Dataset,
  chunks: Chunk[],
  theme: Theme = DEFAULT_THEME
): Promise<void> {
  const children: (Paragraph | Table)[] = [];
  const now = new Date();
  const year = now.getFullYear();

  const usedTests = [
    ...new Map(
      chunks.filter((c) => c.result).map((c) => [c.testId, getTest(c.testId)])
    ).values(),
  ];

  // --- Title block ---
  children.push(
    new Paragraph({ text: "Statistinės analizės ataskaita", heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({ text: "Duomenų rinkinys: ", bold: true }),
        new TextRun({ text: dataset.name }),
      ],
    }),
    new Paragraph({
      children: [new TextRun({ text: dataset.description, italics: true, color: INK_2 })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Parengta su Statistikas.lt Analizė · ${now.toLocaleString("lt-LT")}`,
          color: INK_3,
          size: 18,
        }),
      ],
    }),
    new Paragraph({ text: "" })
  );

  // --- Methods (before results) ---
  if (usedTests.length > 0) {
    const methodsSentences = usedTests
      .map((t) => t.methods)
      .filter(Boolean)
      .join(" ");

    children.push(
      new Paragraph({ text: "Metodai", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({
        children: [
          new TextRun({
            text:
              `Statistinė analizė atlikta naudojant Statistikas.lt Analizė (Statistikas.lt, ${year}). ` +
              methodsSentences +
              " Visų testų reikšmingumo lygmuo – α = 0,05.",
          }),
        ],
        spacing: { after: 160 },
      }),
      new Paragraph({ text: "" })
    );
  }

  // --- Results ---
  children.push(new Paragraph({ text: "Rezultatai", heading: HeadingLevel.HEADING_1 }));

  let n = 0;
  let tableNo = 0;
  let figureNo = 0;
  for (const chunk of chunks) {
    if (!chunk.result) continue;
    n++;
    const test = getTest(chunk.testId);
    children.push(
      new Paragraph({ text: `${n}. ${test.name}`, heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        children: [new TextRun({ text: chunk.result.description })],
        spacing: { after: 120 },
      })
    );

    for (const a of chunk.result.assumptions ?? []) {
      const icon = a.status === "pass" ? "✓" : a.status === "warn" ? "⚠" : "✕";
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${icon} ${a.label}: ${a.detail}`,
              italics: true,
              size: 18,
              color: a.status === "pass" ? INK_3 : "b45309",
            }),
          ],
          spacing: { after: 40 },
        })
      );
    }

    for (const table of chunk.result.tables) {
      tableNo++;
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${tableNo} lentelė. ${table.title}`, bold: true })],
          spacing: { before: 120, after: 60 },
          keepNext: true,
        }),
        buildTable(table, theme),
        new Paragraph({ text: "" })
      );
    }

    if (chunk.result.plot) {
      try {
        const png = await svgToPng(renderPlotSvg(chunk.result.plot, theme.plot));
        figureNo++;
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            keepNext: true,
            children: [
              new ImageRun({
                type: "png",
                data: png,
                transformation: { width: 520, height: 325 },
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `${figureNo} pav. ${chunk.result.plot.title}`,
                italics: true,
                size: 18,
                color: INK_2,
              }),
            ],
            spacing: { after: 160 },
          })
        );
      } catch {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "[nepavyko sugeneruoti diagramos]", italics: true })],
          })
        );
      }
    }
  }

  if (n === 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Kol kas nėra užbaigtų analizių, kurias būtų galima eksportuoti.", italics: true }),
        ],
      })
    );
  }

  // --- References (end of document) ---
  if (usedTests.length > 0) {
    const refs = [
      `Statistikas.lt. (${year}). Statistikas.lt Analizė: nemokama statistinė analizė naršyklėje [Kompiuterinė programa]. ${SITE_URL}/analize/`,
      ...usedTests.map((t) => t.apa).filter((a): a is string => !!a),
    ];
    children.push(
      new Paragraph({ text: "Literatūra", heading: HeadingLevel.HEADING_1 }),
      ...refs.map(
        (text) =>
          new Paragraph({
            children: [new TextRun({ text })],
            indent: { left: 360, hanging: 360 },
            spacing: { after: 80 },
          })
      )
    );
  }

  // --- Footer note ---
  children.push(
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Ataskaita parengta su Statistikas.lt Analizė (statistikas.lt/analize). Klausimai dėl analizės ar interpretacijos – ${CONTACT_EMAIL}.`,
          size: 16,
          color: INK_3,
        }),
      ],
    })
  );

  const doc = new Document({
    creator: "Statistikas.lt Analizė",
    title: "Statistinės analizės ataskaita",
    styles: { default: { document: { run: { language: { value: "lt-LT" } } } } },
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `statistine-analize-${dateStamp(now)}.docx`);
}
