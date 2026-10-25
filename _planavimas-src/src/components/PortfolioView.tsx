import { useMemo } from "react";
import { DEMAND_HINT, DEMAND_LABEL, type DemandClass } from "../engine/classify";
import { MODEL_SHORT, type ModelId } from "../engine/models";
import { type Freq, periodShort } from "../engine/periods";
import type { ItemResult } from "../engine/pipeline";
import { type PlanInputs, itemPlan, totals } from "../engine/plan";
import { type PortfolioRow, YEAR } from "../engine/portfolio";
import { fmtPct, fmtQty, fmtSignedPct } from "../format";
import { COLORS, LineChart } from "./LineChart";

const CLASSES: DemandClass[] = ["smooth", "erratic", "intermittent", "lumpy", "sparse"];

export function PortfolioView({
  results,
  freq,
  last,
  inputs,
  level,
  rows,
  basis,
  onSelect,
}: {
  results: ItemResult[];
  freq: Freq;
  last: number;
  inputs: PlanInputs;
  level: number;
  rows: PortfolioRow[];
  basis: "revenue" | "volume";
  onSelect: (item: string) => void;
}) {
  const tot = useMemo(() => totals(results, inputs, last, level), [results, inputs, last, level]);
  const h = tot.plan.length;
  const year = YEAR[freq];

  // Show at most two years of history before the forecast.
  const histShown = Math.min(tot.history.length, 2 * year);
  const histStart = tot.history.length - histShown;
  const n = histShown + h;
  const firstPeriod = tot.start + histStart;
  const pad = (k: number) => new Array<null>(k).fill(null);
  const hist = tot.history.slice(histStart);

  const planSum = tot.plan.reduce((a, b) => a + b, 0);
  // Same periods one year earlier.
  const lyFrom = tot.history.length - year;
  const lastYear = lyFrom >= 0 && lyFrom + h <= tot.history.length ? tot.history.slice(lyFrom, lyFrom + h).reduce((a, b) => a + b, 0) : null;
  const vol = new Map(rows.map((r) => [r.item, r.volume]));
  let wNum = 0;
  let wDen = 0;
  for (const r of results)
    if (r.acc && Number.isFinite(r.acc.wape)) {
      const v = vol.get(r.item) ?? 0;
      wNum += r.acc.wape * v;
      wDen += v;
    }
  const wape = wDen > 0 ? wNum / wDen : NaN;

  const abc = new Map(rows.map((r) => [r.item, r.abc]));
  const value = (r: PortfolioRow) => (basis === "revenue" ? r.revenue ?? 0 : r.volume);
  const totalValue = rows.reduce((s, r) => s + value(r), 0);
  const matrix = (["A", "B", "C"] as const).map((a) =>
    (["X", "Y", "Z"] as const).map((x) => {
      const items = results.filter((r) => abc.get(r.item) === a && r.xyz === x);
      const v = rows.filter((r) => items.some((i) => i.item === r.item)).reduce((s, r) => s + value(r), 0);
      return { count: items.length, share: totalValue > 0 ? v / totalValue : 0, items };
    })
  );

  const byClass = CLASSES.map((c) => {
    const items = results.filter((r) => r.cls === c);
    const models = new Map<ModelId, number>();
    for (const r of items) models.set(r.model, (models.get(r.model) ?? 0) + 1);
    return { c, items, models: [...models.entries()].sort((a, b) => b[1] - a[1]) };
  }).filter((x) => x.items.length);

  const groups = useMemo(() => {
    const g = new Map<string, { items: number; ly: number; plan: number; lyH: number }>();
    for (const r of results) {
      if (!r.group) continue;
      const e = g.get(r.group) ?? { items: 0, ly: 0, plan: 0, lyH: 0 };
      e.items++;
      e.ly += vol.get(r.item) ?? 0;
      e.plan += itemPlan(r, inputs).reduce((a, b) => a + b, 0);
      // Item history is aligned to the end (last period), so index from the end.
      const from = r.y.length - year;
      if (from >= 0) for (let j = 0; j < h && from + j < r.y.length; j++) e.lyH += r.y[from + j];
      g.set(r.group, e);
    }
    return [...g.entries()].sort((a, b) => b[1].ly - a[1].ly);
  }, [results, inputs, h, year]);

  return (
    <div className="view">
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">Prekės</span>
          <strong className="kpi-value">{results.length}</strong>
          <span className="kpi-note">{matrix[0].reduce((s, c) => s + c.count, 0)} A klasės</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Planas per {h} per.</span>
          <strong className="kpi-value">{fmtQty(planSum)}</strong>
          <span className="kpi-note">vnt.</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Palyginti su pernai</span>
          <strong className="kpi-value">{lastYear ? fmtSignedPct(planSum / lastYear - 1) : "–"}</strong>
          <span className="kpi-note">{lastYear ? `tie patys periodai pernai: ${fmtQty(lastYear)}` : "nepakanka istorijos"}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tikslumas (WAPE)</span>
          <strong className="kpi-value">{Number.isFinite(wape) ? fmtPct(wape) : "–"}</strong>
          <span className="kpi-note">vidutinė paklaida testuojant, svertinė pagal apimtį</span>
        </div>
      </div>

      <h3 className="view-title">Visos prekės: istorija ir planas</h3>
      <LineChart
        n={n}
        xLabel={(i) => periodShort(firstPeriod + i, freq)}
        ariaLabel="Bendra paklausa: istorija ir planas"
        splitAt={histShown}
        series={[
          { key: "actual", label: "Faktas", color: COLORS.actual, values: [...hist, ...pad(h)] },
          {
            key: "plan",
            label: "Planas",
            color: COLORS.forecast,
            values: [...pad(histShown - 1), hist[hist.length - 1], ...tot.plan],
            tipFrom: histShown,
          },
        ]}
        band={{
          label: `${Math.round(level * 100)} % intervalas`,
          lower: [...pad(histShown), ...tot.lower],
          upper: [...pad(histShown), ...tot.upper],
        }}
        refLine={inputs.capacity ? { value: inputs.capacity, label: `Pajėgumai: ${fmtQty(inputs.capacity)}` } : undefined}
      />
      <p className="chart-note">
        Bendras intervalas skaičiuojamas darant prielaidą, kad prekių paklaidos nepriklausomos – realybėje jis gali būti
        platesnis.
      </p>

      <div className="two-col">
        <div>
          <h3 className="view-title">ABC × XYZ</h3>
          <p className="view-sub">
            ABC – {basis === "revenue" ? "pajamų" : "kiekio"} dalis per paskutinius metus (A – 80 %, B – kiti 15 %, C – 5 %). XYZ –
            paklausos svyravimas (X – stabili, Z – labai nepastovi).
          </p>
          <table className="matrix">
            <thead>
              <tr>
                <th />
                <th className="cell-num">X</th>
                <th className="cell-num">Y</th>
                <th className="cell-num">Z</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, i) => (
                <tr key={i}>
                  <th scope="row">{["A", "B", "C"][i]}</th>
                  {row.map((c, j) => (
                    <td
                      key={j}
                      className="cell-num matrix-cell"
                      style={{ background: `rgba(31, 69, 160, ${Math.min(0.85, c.share * 1.6).toFixed(2)})`, color: c.share > 0.3 ? "#fff" : undefined }}
                      title={c.items.map((x) => x.item).join(", ")}
                    >
                      <strong>{c.count}</strong>
                      <span>{fmtPct(c.share)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="view-sub">
            AX–AY prekėms verta skirti daugiausia planavimo dėmesio; CZ – svarstyti, ar jas laikyti sandėlyje, ar užsakyti
            pagal poreikį.
          </p>
        </div>
        <div>
          <h3 className="view-title">Paklausos tipai</h3>
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tipas</th>
                <th className="cell-num">Prekių</th>
                <th>Dažniausi modeliai</th>
              </tr>
            </thead>
            <tbody>
              {byClass.map(({ c, items, models }) => (
                <tr key={c}>
                  <td title={DEMAND_HINT[c]}>
                    {DEMAND_LABEL[c]}
                    <div className="muted small">{DEMAND_HINT[c]}</div>
                  </td>
                  <td className="cell-num">{items.length}</td>
                  <td className="wrap">{models.slice(0, 3).map(([m, k]) => `${MODEL_SHORT[m]} (${k})`).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {groups.length > 0 && (
        <>
          <h3 className="view-title">Pagal grupes</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Grupė</th>
                  <th className="cell-num">Prekių</th>
                  <th className="cell-num">Pernai per metus</th>
                  <th className="cell-num">Planas per {h} per.</th>
                  <th className="cell-num">Pokytis</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(([g, e]) => (
                  <tr key={g}>
                    <td>{g}</td>
                    <td className="cell-num">{e.items}</td>
                    <td className="cell-num">{fmtQty(e.ly)}</td>
                    <td className="cell-num">{fmtQty(e.plan)}</td>
                    <td className="cell-num">{e.lyH > 0 ? fmtSignedPct(e.plan / e.lyH - 1) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="view-title">Didžiausios prekės</h3>
      <div className="table-scroll">
        <table className="clickable">
          <thead>
            <tr>
              <th>Prekė</th>
              <th>ABC/XYZ</th>
              <th className="cell-num">Pernai, vnt.</th>
              {basis === "revenue" && <th className="cell-num">Pernai, €</th>}
              <th className="cell-num">Planas, vnt.</th>
              <th className="cell-num">WAPE</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .slice()
              .sort((a, b) => value(b) - value(a))
              .slice(0, 10)
              .map((p) => {
                const r = results.find((x) => x.item === p.item)!;
                return (
                  <tr key={p.item} onClick={() => onSelect(p.item)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect(p.item)}>
                    <td>{p.item}</td>
                    <td>
                      {p.abc}
                      {r.xyz}
                    </td>
                    <td className="cell-num">{fmtQty(p.volume)}</td>
                    {basis === "revenue" && <td className="cell-num">{fmtQty(p.revenue ?? 0)}</td>}
                    <td className="cell-num">{fmtQty(itemPlan(r, inputs).reduce((a, b) => a + b, 0))}</td>
                    <td className="cell-num">{r.acc ? fmtPct(r.acc.wape) : "–"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
