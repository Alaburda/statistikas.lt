import type { Chunk, Dataset } from "../types";
import { computeTable1 } from "../stats/table1";

interface Props {
  chunk: Chunk;
  dataset: Dataset;
  onChange: (next: Chunk) => void;
}

function parseRowVars(raw: string | undefined): string[] {
  try {
    return JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
}

export function Table1Card({ chunk, dataset, onChange }: Props) {
  const groupVar = chunk.picks.groupVar ?? "";
  const rowVars = parseRowVars(chunk.picks.rowVars);
  const showTotal = chunk.picks.showTotal !== "0";

  const update = (partial: Record<string, string>) =>
    onChange({ ...chunk, picks: { ...chunk.picks, ...partial } });

  const addRowVar = (key: string) => {
    if (!key || rowVars.includes(key)) return;
    update({ rowVars: JSON.stringify([...rowVars, key]) });
  };

  const removeRowVar = (key: string) =>
    update({ rowVars: JSON.stringify(rowVars.filter((k) => k !== key)) });

  const catVars = dataset.variables.filter((v) => v.type === "categorical");
  const availableForRows = dataset.variables.filter((v) => !rowVars.includes(v.key));
  const hasGrouping = !!groupVar;

  const tableData =
    rowVars.length > 0
      ? computeTable1(dataset, groupVar || null, rowVars, showTotal)
      : null;

  return (
    <div className="t1-body">
      <div className="t1-controls">
        <label className="t1-control">
          <span className="t1-ctrl-label">Group columns by</span>
          <select
            value={groupVar}
            onChange={(e) => update({ groupVar: e.target.value })}
          >
            <option value="">— none (overall only) —</option>
            {catVars.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        {hasGrouping && (
          <label className="t1-control t1-toggle-wrap">
            <input
              type="checkbox"
              checked={showTotal}
              onChange={() => update({ showTotal: showTotal ? "0" : "1" })}
            />
            <span>Show total</span>
          </label>
        )}
      </div>

      <div className="t1-rowvars">
        <span className="t1-ctrl-label">Row variables</span>
        <div className="t1-tags">
          {rowVars.map((key) => {
            const v = dataset.variables.find((vv) => vv.key === key);
            return (
              <span
                key={key}
                className={`t1-tag t1-tag--${v?.type ?? "numeric"}`}
              >
                {v?.label ?? key}
                <button
                  className="t1-tag-x"
                  onClick={() => removeRowVar(key)}
                  title="Remove variable"
                >
                  ×
                </button>
              </span>
            );
          })}
          {availableForRows.length > 0 && (
            <select
              className="t1-add-select"
              value=""
              onChange={(e) => {
                if (e.target.value) addRowVar(e.target.value);
              }}
            >
              <option value="">+ Add variable…</option>
              {availableForRows.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label} ({v.type})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {tableData ? (
        <div className="result">
          <div className="table-block">
            <div className="table-title">Table 1. Baseline characteristics</div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="t1-var-col"></th>
                    {tableData.groupHeaders.map((h, i) => (
                      <th key={i} className="cell-num">
                        {h}
                      </th>
                    ))}
                  </tr>
                  <tr className="t1-n-row">
                    <td></td>
                    {tableData.nRow.map((n, i) => (
                      <td key={i} className="cell-num t1-n-cell">
                        {n}
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((row, i) => (
                    <tr key={i}>
                      <td
                        className={
                          row.bold
                            ? "t1-cat-hdr"
                            : row.indent
                            ? "t1-indent"
                            : ""
                        }
                      >
                        {row.label}
                      </td>
                      {row.cells.map((cell, j) => (
                        <td
                          key={j}
                          className={cell && !row.bold ? "cell-num" : ""}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="chunk-hint">
          Add at least one variable to the rows above.
        </div>
      )}
    </div>
  );
}
