import type { AnalysisResult } from "../types";
import { Plot } from "./Plot";

function isNum(v: string | number): boolean {
  if (typeof v === "number") return true;
  const s = String(v).trim();
  if (/^[<>≤≥]\s*[.,]?\d/.test(s)) return true; // < 0,001, > 0,05 etc.
  // Lithuanian numbers: decimal comma, optional (no-break/thin) space as thousands separator, U+2212 minus.
  const n = s.replace(/[\s  ]/g, "").replace("−", "-").replace(",", ".");
  return n !== "" && n !== "—" && !isNaN(Number(n));
}

export function ResultView({ result }: { result: AnalysisResult }) {
  return (
    <div className="result">
      <p className="result-desc">{result.description}</p>
      {result.tables.map((t, i) => {
        const numCols = t.columns.map((_, ci) =>
          t.rows.filter((row) => isNum(row[ci])).length > t.rows.length / 2
        );
        return (
          <div className="table-block" key={i}>
            <div className="table-title">{t.title}</div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {t.columns.map((c, j) => (
                      <th key={j} className={numCols[j] ? "cell-num" : ""}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className={isNum(cell) ? "cell-num" : ""}>{String(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {result.plot && <Plot spec={result.plot} />}
    </div>
  );
}
