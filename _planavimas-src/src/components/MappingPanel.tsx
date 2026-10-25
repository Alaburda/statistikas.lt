import type { ColumnMap } from "../engine/dataset";
import { MODEL_LABEL, type ModelId } from "../engine/models";
import { type Freq, FREQ_LABEL } from "../engine/periods";

export interface RunSettings {
  freq: Freq | null;
  horizon: number;
  level: number;
  model: ModelId | "auto";
  cleanAnomalies: boolean;
}

export const DEFAULT_HORIZON: Record<Freq, number> = { day: 28, week: 26, month: 12 };
export const MAX_HORIZON: Record<Freq, number> = { day: 120, week: 104, month: 36 };

const ROLES: { key: keyof ColumnMap; label: string; hint: string; required: boolean }[] = [
  { key: "date", label: "Data", hint: "pardavimo diena, savaitė ar mėnuo", required: true },
  { key: "qty", label: "Kiekis", hint: "parduoti vienetai (paklausa)", required: true },
  { key: "item", label: "Prekė", hint: "SKU, kodas ar pavadinimas", required: false },
  { key: "group", label: "Grupė", hint: "kategorija, prekės ženklas, regionas", required: false },
  { key: "price", label: "Kaina", hint: "vieneto kaina – elastingumui", required: false },
  { key: "promo", label: "Akcija", hint: "1 / taip, kai buvo akcija", required: false },
];

const PICKABLE_MODELS: (ModelId | "auto")[] = ["auto", "ets", "theta", "sprofile", "snaive", "ma", "naive", "croston", "sba", "tsb", "combo"];

export function MappingPanel({
  header,
  preview,
  map,
  onMap,
  settings,
  onSettings,
  dataFreq,
  onRun,
  running,
}: {
  header: string[];
  preview: string[][];
  map: ColumnMap;
  onMap: (m: ColumnMap) => void;
  settings: RunSettings;
  onSettings: (s: RunSettings) => void;
  dataFreq: Freq | null;
  onRun: () => void;
  running: boolean;
}) {
  const freqOptions: Freq[] = dataFreq === "day" ? ["day", "week", "month"] : dataFreq === "week" ? ["week", "month"] : ["month"];
  const freq = settings.freq ?? dataFreq ?? "month";
  const dup = ROLES.some((r) => {
    const v = map[r.key];
    return v !== null && ROLES.some((o) => o.key !== r.key && map[o.key] === v);
  });
  return (
    <section className="panel" aria-labelledby="map-title">
      <div className="panel-head">
        <span className="step-num">2</span>
        <h2 id="map-title">Stulpeliai ir nustatymai</h2>
      </div>
      <p className="panel-sub">Patikrinkite, ar stulpeliai atpažinti teisingai. Privalomi tik data ir kiekis.</p>
      <div className="map-grid">
        {ROLES.map((r) => (
          <label key={r.key} className="map-field">
            <span className="map-label">
              {r.label}
              {r.required && <span className="req"> *</span>}
            </span>
            <select
              value={map[r.key] ?? ""}
              onChange={(e) => onMap({ ...map, [r.key]: e.target.value === "" ? null : Number(e.target.value) })}
            >
              {!r.required && <option value="">(nėra)</option>}
              {header.map((h, i) => (
                <option key={i} value={i}>
                  {h || `Stulpelis ${i + 1}`}
                </option>
              ))}
            </select>
            <span className="map-hint">{r.hint}</span>
          </label>
        ))}
      </div>
      {dup && <p className="warn-line">Tas pats stulpelis parinktas kelioms rolėms.</p>}

      <div className="table-scroll preview">
        <table>
          <thead>
            <tr>
              {header.map((h, i) => {
                const role = ROLES.find((r) => map[r.key] === i);
                return (
                  <th key={i}>
                    {h}
                    {role && <span className="role-tag">{role.label}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, r) => (
              <tr key={r}>
                {header.map((_, c) => (
                  <td key={c}>{row[c] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="settings-grid">
        <label className="map-field">
          <span className="map-label">Planavimo periodas</span>
          <select
            value={freq}
            onChange={(e) => {
              const f = e.target.value as Freq;
              onSettings({ ...settings, freq: f, horizon: DEFAULT_HORIZON[f] });
            }}
          >
            {freqOptions.map((f) => (
              <option key={f} value={f}>
                {FREQ_LABEL[f]}
                {f === dataFreq ? " (kaip duomenyse)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="map-field">
          <span className="map-label">Horizontas, periodų</span>
          <input
            type="number"
            min={1}
            max={MAX_HORIZON[freq]}
            value={settings.horizon}
            onChange={(e) =>
              onSettings({ ...settings, horizon: Math.max(1, Math.min(MAX_HORIZON[freq], Number(e.target.value) || 1)) })
            }
          />
        </label>
        <label className="map-field">
          <span className="map-label">Intervalai</span>
          <select value={settings.level} onChange={(e) => onSettings({ ...settings, level: Number(e.target.value) })}>
            <option value={0.8}>80 %</option>
            <option value={0.9}>90 %</option>
            <option value={0.95}>95 %</option>
          </select>
        </label>
        <label className="map-field">
          <span className="map-label">Modelis</span>
          <select
            value={settings.model}
            onChange={(e) => onSettings({ ...settings, model: e.target.value as ModelId | "auto" })}
          >
            {PICKABLE_MODELS.map((m) => (
              <option key={m} value={m}>
                {m === "auto" ? "Automatinis parinkimas (rekomenduojama)" : MODEL_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="check-line">
        <input
          type="checkbox"
          checked={settings.cleanAnomalies}
          onChange={(e) => onSettings({ ...settings, cleanAnomalies: e.target.checked })}
        />
        Prieš prognozuojant pakeisti išskirtis tikėtina reikšme (rekomenduojama)
      </label>
      <div className="run-row">
        <button className="primary-btn big-btn" onClick={onRun} disabled={running || dup}>
          {running ? "Skaičiuojama…" : "Tikrinti duomenis ir prognozuoti →"}
        </button>
      </div>
    </section>
  );
}
