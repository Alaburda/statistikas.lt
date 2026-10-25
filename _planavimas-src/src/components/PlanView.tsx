import { useMemo } from "react";
import { type Freq, periodLabel } from "../engine/periods";
import type { ItemResult } from "../engine/pipeline";
import { type PlanInputs, inventory, itemPlan, totals } from "../engine/plan";
import { fmtQty } from "../format";

const MAX_ROWS = 200;

export function PlanView({
  results,
  freq,
  last,
  inputs,
  level,
  onInputs,
  onExport,
  exporting,
}: {
  results: ItemResult[];
  freq: Freq;
  last: number;
  inputs: PlanInputs;
  level: number;
  onInputs: (p: PlanInputs) => void;
  onExport: (kind: "xlsx" | "csv") => void;
  exporting: boolean;
}) {
  const tot = useMemo(() => totals(results, inputs, last, level), [results, inputs, last, level]);
  const h = tot.plan.length;
  const labels = Array.from({ length: h }, (_, j) => periodLabel(last + 1 + j, freq));
  const over = inputs.capacity ? tot.plan.map((p, j) => ({ j, gap: p - inputs.capacity! })).filter((x) => x.gap > 0) : [];
  const rows = results.slice(0, MAX_ROWS);
  const unit = freq === "day" ? "d." : freq === "week" ? "sav." : "mėn.";

  const setNum = (key: "leadTime" | "serviceLevel", v: number) => onInputs({ ...inputs, [key]: v });

  return (
    <div className="view">
      <div className="export-bar">
        <div>
          <strong>Atsisiųsti planą</strong>
          <span className="muted small"> planas, prognozė su intervalais, atsargos, tikslumas ir duomenų patikra</span>
        </div>
        <div className="export-actions">
          <button className="primary-btn" onClick={() => onExport("xlsx")} disabled={exporting}>
            {exporting ? "Ruošiama…" : "Excel (.xlsx)"}
          </button>
          <button onClick={() => onExport("csv")} disabled={exporting}>
            CSV
          </button>
        </div>
      </div>

      <h3 className="view-title">Pajėgumų patikra</h3>
      <div className="inline-fields">
        <label className="inline-field">
          Pajėgumai per periodą, vnt.
          <input
            type="number"
            min={0}
            placeholder="pvz., 4000"
            value={inputs.capacity ?? ""}
            onChange={(e) => onInputs({ ...inputs, capacity: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
          />
        </label>
      </div>
      {inputs.capacity ? (
        over.length ? (
          <p className="warn-line">
            Planas viršija pajėgumus {over.length} {over.length === 1 ? "periodą" : "periodus"}:{" "}
            {over
              .slice(0, 8)
              .map((x) => `${labels[x.j]} (+${fmtQty(x.gap)})`)
              .join(", ")}
            {over.length > 8 ? ", …" : ""}. Iš viso trūksta {fmtQty(over.reduce((s, x) => s + x.gap, 0))} vnt. – svarstykite
            gamybą ar užsakymus iš anksto, viršvalandžius arba paklausos perkėlimą.
          </p>
        ) : (
          <p className="ok-line">Planas telpa į pajėgumus visą horizontą (didžiausias periodas – {fmtQty(Math.max(...tot.plan))} vnt.).</p>
        )
      ) : (
        <p className="view-sub">Įveskite gamybos, sandėlio ar tiekėjo pajėgumus – bendroje diagramoje atsiras linija ir trūkumai.</p>
      )}

      <h3 className="view-title">Planas pagal prekes</h3>
      <p className="view-sub">Koregavimas taikomas visam prekės horizontui. Akcijas planuokite prekės kortelėje.</p>
      <div className="table-scroll plan-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="sticky-col">Prekė</th>
              <th className="cell-num">Koreg., %</th>
              {labels.map((l) => (
                <th key={l} className="cell-num">
                  {l}
                </th>
              ))}
              <th className="cell-num">Iš viso</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = itemPlan(r, inputs);
              const promos = new Set(inputs.promos[r.item] ?? []);
              return (
                <tr key={r.item}>
                  <td className="sticky-col wrap">{r.item}</td>
                  <td className="cell-num">
                    <input
                      className="cell-input"
                      type="number"
                      step={1}
                      value={inputs.adjust[r.item] ?? 0}
                      aria-label={`${r.item}: koregavimas, %`}
                      onChange={(e) => onInputs({ ...inputs, adjust: { ...inputs.adjust, [r.item]: Number(e.target.value) || 0 } })}
                    />
                  </td>
                  {p.map((v, j) => (
                    <td key={j} className={`cell-num${promos.has(j) ? " cell-promo" : ""}`} title={promos.has(j) ? "Planuota akcija" : undefined}>
                      {fmtQty(v)}
                    </td>
                  ))}
                  <td className="cell-num">
                    <strong>{fmtQty(p.reduce((a, b) => a + b, 0))}</strong>
                  </td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td className="sticky-col">Iš viso</td>
              <td />
              {tot.plan.map((v, j) => (
                <td key={j} className={`cell-num${inputs.capacity && v > inputs.capacity ? " cell-over" : ""}`}>
                  {fmtQty(v)}
                </td>
              ))}
              <td className="cell-num">{fmtQty(tot.plan.reduce((a, b) => a + b, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {results.length > MAX_ROWS && (
        <p className="table-note">
          Rodomos {MAX_ROWS} didžiausios prekės iš {results.length}; eksportuojamos visos, sumos skaičiuojamos iš visų.
        </p>
      )}

      <h3 className="view-title">Atsargos</h3>
      <div className="inline-fields">
        <label className="inline-field">
          Aptarnavimo lygis
          <select value={inputs.serviceLevel} onChange={(e) => setNum("serviceLevel", Number(e.target.value))}>
            <option value={0.9}>90 %</option>
            <option value={0.95}>95 %</option>
            <option value={0.975}>97,5 %</option>
            <option value={0.99}>99 %</option>
          </select>
        </label>
        <label className="inline-field">
          Tiekimo laikas, {unit}
          <input
            type="number"
            min={1}
            max={52}
            value={inputs.leadTime}
            onChange={(e) => setNum("leadTime", Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
          />
        </label>
      </div>
      <p className="view-sub">
        Saugos atsarga apsaugo nuo prognozės paklaidų per tiekimo laiką: su {Math.round(inputs.serviceLevel * 1000) / 10} %
        tikimybe prekės neturėtų pritrūkti. Įveskite turimą likutį – apskaičiuosime siūlomą užsakymą (iki užsakymo taško plius
        vieno periodo paklausa).
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Prekė</th>
              <th className="cell-num">Saugos atsarga</th>
              <th className="cell-num">Paklausa per tiekimo laiką</th>
              <th className="cell-num">Užsakymo taškas</th>
              <th className="cell-num">Turimas likutis</th>
              <th className="cell-num">Siūlomas užsakymas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const inv = inventory(r, itemPlan(r, inputs), inputs);
              return (
                <tr key={r.item}>
                  <td className="wrap">{r.item}</td>
                  <td className="cell-num">{fmtQty(Math.ceil(inv.safetyStock))}</td>
                  <td className="cell-num">{fmtQty(Math.ceil(inv.leadDemand))}</td>
                  <td className="cell-num">
                    <strong>{fmtQty(Math.ceil(inv.reorderPoint))}</strong>
                  </td>
                  <td className="cell-num">
                    <input
                      className="cell-input"
                      type="number"
                      min={0}
                      value={inv.onHand ?? ""}
                      placeholder="–"
                      aria-label={`${r.item}: turimas likutis`}
                      onChange={(e) => {
                        const onHand = { ...inputs.onHand };
                        if (e.target.value === "") delete onHand[r.item];
                        else onHand[r.item] = Math.max(0, Number(e.target.value));
                        onInputs({ ...inputs, onHand });
                      }}
                    />
                  </td>
                  <td className="cell-num">
                    {inv.order === null ? "" : inv.order > 0 ? <strong>{fmtQty(Math.ceil(inv.order))}</strong> : "nereikia"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
