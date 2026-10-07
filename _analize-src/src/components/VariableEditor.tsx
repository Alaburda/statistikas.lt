import { useState } from "react";
import type { Dataset, Variable } from "../types";
import { TYPE_LABEL } from "./labels";

/** Distinct non-missing raw values of a column, sorted, capped for sanity. */
function distinctValues(dataset: Dataset, key: string): string[] {
  const set = new Set<string>();
  for (const row of dataset.rows) {
    const v = row[key];
    if (v === null || v === undefined || v === "") continue;
    set.add(String(v));
    if (set.size > 50) break;
  }
  return [...set].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a < b ? -1 : 1;
  });
}

export function VariableEditor({
  dataset,
  onChange,
}: {
  dataset: Dataset;
  onChange: (next: Dataset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const replaceVar = (key: string, next: Variable) => {
    onChange({ ...dataset, variables: dataset.variables.map((v) => (v.key === key ? next : v)) });
  };

  const setLabel = (v: Variable, label: string) => replaceVar(v.key, { ...v, label });

  const setType = (v: Variable, type: Variable["type"]) => {
    if (type === "numeric") replaceVar(v.key, { ...v, type, valueLabels: undefined });
    else replaceVar(v.key, { ...v, type, valueLabels: v.valueLabels ?? {} });
  };

  const setValueLabel = (v: Variable, raw: string, label: string) => {
    const valueLabels = { ...(v.valueLabels ?? {}) };
    if (label.trim() === "") delete valueLabels[raw];
    else valueLabels[raw] = label;
    replaceVar(v.key, { ...v, valueLabels });
  };

  return (
    <div className="var-editor">
      <button className="link-btn" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} Redaguoti kintamuosius – pervadinti, perkoduoti, keisti tipą
      </button>
      {open && (
        <div className="var-list">
          {dataset.variables.map((v) => {
            const isExpanded = expanded === v.key;
            return (
              <div className="var-row" key={v.key}>
                <div className="var-main">
                  <code className="var-key" title="pradinis stulpelio pavadinimas">
                    {v.key}
                  </code>
                  <input
                    className="var-label-input"
                    value={v.label}
                    onChange={(e) => setLabel(v, e.target.value)}
                    aria-label={`Kintamojo „${v.key}“ pavadinimas`}
                  />
                  <select
                    className="var-type-select"
                    value={v.type}
                    onChange={(e) => setType(v, e.target.value as Variable["type"])}
                  >
                    <option value="numeric">{TYPE_LABEL.numeric}</option>
                    <option value="categorical">{TYPE_LABEL.categorical}</option>
                  </select>
                  {v.type === "categorical" ? (
                    <button
                      className="link-btn recode-toggle"
                      onClick={() => setExpanded(isExpanded ? null : v.key)}
                    >
                      {isExpanded ? "slėpti reikšmes" : "perkoduoti reikšmes"}
                    </button>
                  ) : (
                    <span className="recode-spacer" />
                  )}
                </div>
                {isExpanded && v.type === "categorical" && (
                  <div className="value-grid">
                    {distinctValues(dataset, v.key).map((raw) => (
                      <label className="value-row" key={raw}>
                        <code className="value-raw">{raw}</code>
                        <span className="value-arrow">→</span>
                        <input
                          value={v.valueLabels?.[raw] ?? ""}
                          placeholder={raw}
                          onChange={(e) => setValueLabel(v, raw, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
