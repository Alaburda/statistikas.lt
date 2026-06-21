import { useState } from "react";
import type { Dataset } from "../types";

export function DataPreview({ dataset }: { dataset: Dataset }) {
  const [open, setOpen] = useState(false);
  const preview = dataset.rows.slice(0, 8);
  return (
    <div className="data-preview">
      <button className="link-btn" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} Data preview ({dataset.rows.length} rows × {dataset.variables.length} columns)
      </button>
      {open && (
        <div className="table-scroll preview-scroll">
          <table>
            <thead>
              <tr>
                {dataset.variables.map((v) => (
                  <th key={v.key}>
                    {v.label}
                    <em className={`vtype ${v.type}`}>{v.type === "numeric" ? "123" : "abc"}</em>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i}>
                  {dataset.variables.map((v) => {
                    const raw = row[v.key];
                    const display =
                      v.valueLabels && raw !== null ? v.valueLabels[String(raw)] ?? String(raw) : String(raw ?? "");
                    return <td key={v.key}>{display}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
