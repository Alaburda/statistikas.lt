import { useMemo, useState } from "react";
import { DEMAND_HINT, DEMAND_LABEL, type DemandClass } from "../engine/classify";
import { MODEL_SHORT } from "../engine/models";
import { type Freq, periodLabel, periodShort } from "../engine/periods";
import type { ItemResult } from "../engine/pipeline";
import { type PlanInputs, itemBands, itemPlan } from "../engine/plan";
import type { PortfolioRow } from "../engine/portfolio";
import { fmtNum, fmtP, fmtPct, fmtQty, fmtSignedPct } from "../format";
import { COLORS, type ChartMarker, LineChart } from "./LineChart";

type SortKey = "volume" | "item" | "wape" | "plan";

export function ItemsView({
  results,
  rows,
  freq,
  last,
  inputs,
  level,
  selected,
  onSelect,
  onInputs,
}: {
  results: ItemResult[];
  rows: PortfolioRow[];
  freq: Freq;
  last: number;
  inputs: PlanInputs;
  level: number;
  selected: string | null;
  onSelect: (item: string | null) => void;
  onInputs: (p: PlanInputs) => void;
}) {
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState<DemandClass | "">("");
  const [abcF, setAbcF] = useState<"" | "A" | "B" | "C">("");
  const [sort, setSort] = useState<SortKey>("volume");
  const pmap = useMemo(() => new Map(rows.map((r) => [r.item, r])), [rows]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = results.filter(
      (r) =>
        (!q || r.item.toLowerCase().includes(q) || r.group.toLowerCase().includes(q)) &&
        (!cls || r.cls === cls) &&
        (!abcF || pmap.get(r.item)?.abc === abcF)
    );
    const planSum = (r: ItemResult) => itemPlan(r, inputs).reduce((a, b) => a + b, 0);
    out.sort((a, b) => {
      if (sort === "item") return a.item.localeCompare(b.item, "lt");
      if (sort === "wape") return (b.acc?.wape ?? -1) - (a.acc?.wape ?? -1);
      if (sort === "plan") return planSum(b) - planSum(a);
      return (pmap.get(b.item)?.volume ?? 0) - (pmap.get(a.item)?.volume ?? 0);
    });
    return out;
  }, [results, query, cls, abcF, sort, pmap, inputs]);

  const current = selected ? results.find((r) => r.item === selected) ?? null : null;
  const shown = list.slice(0, 300);

  return (
    <div className="view">
      {current && (
        <ItemDetail
          r={current}
          abc={pmap.get(current.item)?.abc ?? "C"}
          freq={freq}
          last={last}
          inputs={inputs}
          level={level}
          onInputs={onInputs}
          onClose={() => onSelect(null)}
        />
      )}
      <div className="filters">
        <input
          type="search"
          placeholder="Ieškoti prekės ar grupės…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Ieškoti prekės"
        />
        <select value={abcF} onChange={(e) => setAbcF(e.target.value as "" | "A" | "B" | "C")} aria-label="ABC klasė">
          <option value="">Visos ABC</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
        <select value={cls} onChange={(e) => setCls(e.target.value as DemandClass | "")} aria-label="Paklausos tipas">
          <option value="">Visi paklausos tipai</option>
          {(Object.keys(DEMAND_LABEL) as DemandClass[]).map((c) => (
            <option key={c} value={c}>
              {DEMAND_LABEL[c]}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Rikiuoti">
          <option value="volume">Pagal apimtį</option>
          <option value="plan">Pagal planą</option>
          <option value="wape">Pagal paklaidą</option>
          <option value="item">Pagal pavadinimą</option>
        </select>
      </div>
      <div className="table-scroll">
        <table className="clickable">
          <thead>
            <tr>
              <th>Prekė</th>
              <th>Klasė</th>
              <th>Paklausa</th>
              <th>Modelis</th>
              <th className="cell-num">Pernai</th>
              <th className="cell-num">Planas</th>
              <th className="cell-num">WAPE</th>
              <th className="cell-num">Koreg.</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const p = pmap.get(r.item);
              return (
                <tr
                  key={r.item}
                  className={r.item === selected ? "row-active" : undefined}
                  onClick={() => {
                    onSelect(r.item);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(r.item)}
                >
                  <td className="wrap">
                    {r.item}
                    {r.group && <div className="muted small">{r.group}</div>}
                  </td>
                  <td>
                    {p?.abc}
                    {r.xyz}
                  </td>
                  <td>
                    {DEMAND_LABEL[r.cls]}
                    {r.seasonal && <span className="tag">sez.</span>}
                    {r.anomalies.length > 0 && <span className="tag tag-warn">{r.anomalies.length} išsk.</span>}
                  </td>
                  <td>{MODEL_SHORT[r.model]}</td>
                  <td className="cell-num">{fmtQty(p?.volume ?? 0)}</td>
                  <td className="cell-num">{fmtQty(itemPlan(r, inputs).reduce((a, b) => a + b, 0))}</td>
                  <td className="cell-num">{r.acc ? fmtPct(r.acc.wape) : "–"}</td>
                  <td className="cell-num">{inputs.adjust[r.item] ? fmtSignedPct(inputs.adjust[r.item] / 100) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length > shown.length && (
        <p className="table-note">Rodomos pirmos {shown.length} iš {list.length} prekių – susiaurinkite paiešką.</p>
      )}
    </div>
  );
}

function ItemDetail({
  r,
  abc,
  freq,
  last,
  inputs,
  level,
  onInputs,
  onClose,
}: {
  r: ItemResult;
  abc: string;
  freq: Freq;
  last: number;
  inputs: PlanInputs;
  level: number;
  onInputs: (p: PlanInputs) => void;
  onClose: () => void;
}) {
  const [priceChange, setPriceChange] = useState(-10);
  const plan = itemPlan(r, inputs);
  const { lower, upper } = itemBands(r, plan, inputs, level);
  const h = plan.length;
  const n = r.y.length;
  const histShown = Math.min(n, freq === "week" ? 156 : freq === "day" ? 180 : 60);
  const hs = n - histShown;
  const total = histShown + h;
  const firstPeriod = r.start + hs;
  const pad = (k: number) => new Array<null>(Math.max(0, k)).fill(null);
  const hist = r.y.slice(hs);
  const promos = new Set(inputs.promos[r.item] ?? []);

  const holdoutSeries: (number | null)[] = pad(total);
  if (r.holdout)
    r.holdout.forecast.forEach((v, j) => {
      const idx = r.holdout!.from + j - hs;
      if (idx >= 0 && idx < histShown) holdoutSeries[idx] = v;
    });

  const markers: ChartMarker[] = [];
  r.promo?.forEach((p, t) => p && t >= hs && markers.push({ index: t - hs, kind: "promo" }));
  promos.forEach((j) => markers.push({ index: histShown + j, kind: "planned" }));
  r.anomalies.forEach((a) => a.t >= hs && markers.push({ index: a.t - hs, kind: "anomaly" }));

  const adjust = inputs.adjust[r.item] ?? 0;
  const setAdjust = (v: number) => onInputs({ ...inputs, adjust: { ...inputs.adjust, [r.item]: v } });
  const togglePromo = (j: number) => {
    const next = new Set(promos);
    if (next.has(j)) next.delete(j);
    else next.add(j);
    onInputs({ ...inputs, promos: { ...inputs.promos, [r.item]: [...next].sort((a, b) => a - b) } });
  };
  const byMae = r.cls === "smooth" || r.cls === "erratic";
  const best = r.candidates
    .filter((c) => c.acc)
    .sort((a, b) => (byMae ? a.acc!.mae - b.acc!.mae : a.acc!.rmse - b.acc!.rmse));
  const el = r.elasticity;

  return (
    <section className="detail" aria-labelledby="detail-title">
      <div className="detail-head">
        <div>
          <span className="eyebrow">
            {abc}
            {r.xyz} · {DEMAND_LABEL[r.cls]}
            {r.group ? ` · ${r.group}` : ""}
          </span>
          <h2 id="detail-title">{r.item}</h2>
        </div>
        <button className="ghost-btn" onClick={onClose}>
          Uždaryti ✕
        </button>
      </div>

      <LineChart
        n={total}
        xLabel={(i) => periodShort(firstPeriod + i, freq)}
        ariaLabel={`${r.item}: istorija ir prognozė`}
        splitAt={histShown}
        markers={markers}
        series={[
          { key: "actual", label: "Faktas", color: COLORS.actual, values: [...hist, ...pad(h)] },
          ...(r.holdout ? [{ key: "test", label: "Testo prognozė", color: COLORS.holdout, values: holdoutSeries, dash: true }] : []),
          ...(adjust || promos.size
            ? [{ key: "stat", label: "Statistinė prognozė", color: COLORS.statistical, values: [...pad(histShown), ...r.forecast], dash: true }]
            : []),
          {
            key: "plan",
            label: "Planas",
            color: COLORS.forecast,
            values: [...pad(histShown - 1), hist[hist.length - 1], ...plan],
            tipFrom: histShown,
          },
        ]}
        band={{ label: `${Math.round(level * 100)} % intervalas`, lower: [...pad(histShown), ...lower], upper: [...pad(histShown), ...upper] }}
      />

      <div className="facts">
        <div className="fact">
          <span className="fact-label">Modelis</span>
          <strong>{r.modelLabel}</strong>
          <span className="muted small">{r.form}</span>
        </div>
        <div className="fact">
          <span className="fact-label">Tikslumas teste</span>
          <strong>{r.acc ? `WAPE ${fmtPct(r.acc.wape)}` : "netestuota"}</strong>
          <span className="muted small">
            {r.acc
              ? `poslinkis ${fmtSignedPct(r.acc.bias)} · MASE ${fmtNum(r.acc.mase)}`
              : "per trumpa istorija patikimam testui"}
          </span>
        </div>
        <div className="fact">
          <span className="fact-label">Paklausa</span>
          <strong>{DEMAND_LABEL[r.cls]}</strong>
          <span className="muted small">
            {DEMAND_HINT[r.cls]} (ADI {Number.isFinite(r.adi) ? fmtNum(r.adi) : "–"}, CV² {fmtNum(r.cv2)})
          </span>
        </div>
        <div className="fact">
          <span className="fact-label">Sezoniškumas</span>
          <strong>{r.seasonal ? "Yra" : "Nerastas"}</strong>
          <span className="muted small">stiprumas {fmtNum(r.seasonStrength)} (0–1)</span>
        </div>
      </div>

      {r.anomalies.length > 0 && (
        <p className="note-line">
          Rastos {r.anomalies.length} išskirtys (
          {r.anomalies
            .slice(0, 4)
            .map((a) => `${periodLabel(r.start + a.t, freq)}: ${fmtQty(a.value)} vietoj ~${fmtQty(a.expected)}`)
            .join("; ")}
          {r.anomalies.length > 4 ? "; …" : ""}).{" "}
          {r.cleaned ? "Prieš prognozuojant jos pakeistos tikėtina reikšme." : "Jos paliktos prognozės duomenyse."}
        </p>
      )}

      <div className="two-col">
        <div>
          <h3 className="view-title">Plano koregavimas</h3>
          <label className="inline-field">
            Koregavimas, %
            <input
              type="number"
              step={1}
              value={adjust}
              onChange={(e) => setAdjust(Number(e.target.value) || 0)}
              aria-label="Koregavimas procentais"
            />
          </label>
          <p className="view-sub">
            Pvz., +15 %, jei žinote apie naują klientą, arba −20 %, jei prekė bus pakeista nauja. Koregavimas taikomas visam
            horizontui.
          </p>
          {r.promoUplift !== null ? (
            <>
              <h3 className="view-title">Akcijų planas</h3>
              <p className="view-sub">
                Per {r.promoCount} akcijų period. paklausa buvo vidutiniškai <strong>{fmtSignedPct(r.promoUplift - 1)}</strong>{" "}
                didesnė nei bazinė. Pažymėkite periodus, kuriais planuojate akciją:
              </p>
              <div className="promo-grid">
                {plan.map((_, j) => (
                  <label key={j} className={`promo-cell${promos.has(j) ? " on" : ""}`}>
                    <input type="checkbox" checked={promos.has(j)} onChange={() => togglePromo(j)} />
                    {periodLabel(last + 1 + j, freq)}
                  </label>
                ))}
              </div>
            </>
          ) : (
            r.promo && <p className="view-sub">Akcijų istorijoje per mažai (reikia bent 2), kad būtų galima įvertinti jų efektą.</p>
          )}
        </div>
        <div>
          {el ? (
            <>
              <h3 className="view-title">Kainos elastingumas</h3>
              {el.reliable ? (
                <>
                  <p className="big-number">{fmtNum(el.estimate)}</p>
                  <p className="view-sub">
                    1 % didesnė kaina ≈ {fmtNum(Math.abs(el.estimate), 1)} % {el.estimate < 0 ? "mažesnė" : "didesnė"} paklausa
                    (95 % PI {fmtNum(el.lower)} – {fmtNum(el.upper)}, p {fmtP(el.p)}, n = {el.n}).
                    {el.estimate < -1
                      ? " Paklausa elastinga: nuolaidos didina apyvartą."
                      : el.estimate < 0
                        ? " Paklausa neelastinga: kainos kėlimas apyvartą didintų."
                        : ""}
                  </p>
                  <label className="inline-field">
                    Jei kaina pasikeis, %
                    <input type="number" step={1} value={priceChange} onChange={(e) => setPriceChange(Number(e.target.value) || 0)} />
                  </label>
                  <p className="view-sub">
                    Tikėtinas paklausos pokytis: <strong>{fmtSignedPct(Math.pow(1 + priceChange / 100, el.estimate) - 1)}</strong>
                    {" "}(galioja kainų intervale {fmtNum(el.priceMin)} – {fmtNum(el.priceMax)}).
                  </p>
                </>
              ) : (
                <p className="view-sub">
                  Įvertis {fmtNum(el.estimate)} (95 % PI {fmtNum(el.lower)} – {fmtNum(el.upper)}) per daug neapibrėžtas, kad juo
                  remtumėtės: kaina keitėsi per mažai arba kartu su kitais veiksniais (akcijomis, sezonu).
                </p>
              )}
              <p className="muted small">
                Log–log regresija su trendu{r.seasonal ? ", sezoniškumu" : ""}
                {r.promo ? " ir akcijomis" : ""}. Tai stebėjimų duomenys, ne eksperimentas – vertinkite atsargiai.
              </p>
            </>
          ) : (
            r.price && (
              <>
                <h3 className="view-title">Kainos elastingumas</h3>
                <p className="view-sub">Kaina keitėsi per mažai (arba per mažai periodų su pardavimais), kad būtų galima įvertinti.</p>
              </>
            )
          )}
        </div>
      </div>

      {best.length > 1 && (
        <>
          <h3 className="view-title">Modelių palyginimas (testas su paskutiniais istorijos periodais)</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Modelis</th>
                  <th className="cell-num">MAE</th>
                  <th className="cell-num">RMSE</th>
                  <th className="cell-num">WAPE</th>
                  <th className="cell-num">Poslinkis</th>
                  <th className="cell-num">MASE</th>
                </tr>
              </thead>
              <tbody>
                {best.map((c) => (
                  <tr key={c.model} className={c.model === r.model ? "row-active" : undefined}>
                    <td>
                      {c.label}
                      {c.model === r.model && <span className="tag">parinktas</span>}
                    </td>
                    <td className="cell-num">{fmtNum(c.acc!.mae, 1)}</td>
                    <td className="cell-num">{fmtNum(c.acc!.rmse, 1)}</td>
                    <td className="cell-num">{fmtPct(c.acc!.wape)}</td>
                    <td className="cell-num">{fmtSignedPct(c.acc!.bias)}</td>
                    <td className="cell-num">{fmtNum(c.acc!.mase)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-note">
            {byMae
              ? "Parenkamas mažiausią MAE turintis modelis."
              : "Pertraukiamai paklausai parenkamas mažiausią RMSE turintis modelis (MAE skatintų prognozuoti nulį)."}{" "}
            MASE &lt; 1 – modelis geresnis už naivųjį.
          </p>
        </>
      )}
    </section>
  );
}
