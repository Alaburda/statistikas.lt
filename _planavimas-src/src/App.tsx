import { useMemo, useState } from "react";
import { track } from "./analytics";
import { gridFromCsv } from "./data/csv";
import { demoCsv, demoGrid } from "./data/demo";
import { gridFromXlsx } from "./data/xlsx";
import { type Check, auditChecks } from "./engine/audit";
import { type ColumnMap, type Prepared, guessMapping, prepare } from "./engine/dataset";
import { type Freq, FREQ_LABEL, SEASON, detectDateOrder, detectFreq, parseDate, periodLabel } from "./engine/periods";
import type { ItemResult } from "./engine/pipeline";
import { EMPTY_INPUTS, type PlanInputs } from "./engine/plan";
import { portfolio } from "./engine/portfolio";
import { runForecasts } from "./engine/run";
import { planCsv, planWorkbook } from "./export/plan";
import { download } from "./export/xlsx";
import { ltPlural } from "./format";
import { SITE_URL } from "./site";
import { AuditPanel } from "./components/AuditPanel";
import { ContactLink, CtaPanel, ExportToast, OutLink, SiteFooter } from "./components/Funnel";
import { ItemsView } from "./components/ItemsView";
import { DEFAULT_HORIZON, MappingPanel, type RunSettings } from "./components/MappingPanel";
import { PlanView } from "./components/PlanView";
import { PortfolioView } from "./components/PortfolioView";

interface Source {
  name: string;
  grid: string[][];
  decimalComma: boolean;
  demo: boolean;
}

interface RunResult {
  prep: Prepared;
  results: ItemResult[];
  checks: Check[];
  settings: RunSettings;
}

type Tab = "apzvalga" | "prekes" | "planas" | "patikra";

const MA_WINDOW: Record<Freq, number> = { day: 7, week: 4, month: 3 };

/** Data frequency from the chosen date column (null when it doesn't parse). */
function freqOfColumn(grid: string[][], col: number): Freq | null {
  const sample = grid.slice(1, 5001).map((r) => r[col] ?? "");
  const order = detectDateOrder(sample);
  const days = sample.map((v) => parseDate(v, order)).filter((d): d is number => d !== null);
  return days.length >= 3 ? detectFreq(days) : null;
}

/** Decode CSV bytes: UTF-8, falling back to Windows-1257 (Baltic) for older Excel exports. */
function decodeText(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("�")) return utf8;
  try {
    return new TextDecoder("windows-1257").decode(buf);
  } catch {
    return utf8;
  }
}

export function App() {
  const [source, setSource] = useState<Source | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [settings, setSettings] = useState<RunSettings>({
    freq: null,
    horizon: 26,
    level: 0.8,
    model: "auto",
    cleanAnomalies: true,
  });
  const [run, setRun] = useState<RunResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<PlanInputs>(EMPTY_INPUTS);
  const [tab, setTab] = useState<Tab>("apzvalga");
  const [selected, setSelected] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  const [toast, setToast] = useState(false);
  const [exporting, setExporting] = useState(false);

  const dataFreq = useMemo(() => (source && map ? freqOfColumn(source.grid, map.date) : null), [source, map]);

  const pf = useMemo(() => (run ? portfolio(run.results, run.prep.freq) : null), [run]);

  async function startRun(src: Source, m: ColumnMap, s: RunSettings) {
    setError(null);
    let prep: Prepared;
    try {
      prep = prepare(src.grid, m, src.decimalComma, s.freq);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (prep.series.length === 0) {
      setError("Neliko nė vienos laiko eilutės – patikrinkite stulpelius.");
      return;
    }
    const season = SEASON[prep.freq];
    const opts = {
      horizon: s.horizon,
      m: season,
      maWindow: MA_WINDOW[prep.freq],
      sdHorizon: Math.max(s.horizon, 52),
      model: s.model,
      cleanAnomalies: s.cleanAnomalies,
    };
    setProgress({ done: 0, total: prep.series.length });
    try {
      const results = await runForecasts(prep.series, opts, (done, total) => setProgress({ done, total }));
      const checks = auditChecks(prep, results, season);
      setRun({ prep, results, checks, settings: { ...s, freq: prep.freq } });
      setInputs((prev) => ({ ...EMPTY_INPUTS, serviceLevel: prev.serviceLevel, leadTime: prev.leadTime }));
      setSelected(null);
      setTab("apzvalga");
      setShowSettings(false);
      track("planavimas_forecast", {
        items: results.length,
        freq: prep.freq,
        horizon: s.horizon,
        demo: src.demo ? 1 : 0,
        price: prep.hasPrice ? 1 : 0,
        promo: prep.hasPromo ? 1 : 0,
      });
    } catch (e) {
      setError(`Prognozės apskaičiuoti nepavyko: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProgress(null);
    }
  }

  function loadGrid(src: Source, autoRun: boolean) {
    const header = src.grid[0];
    const m = guessMapping(header, src.grid.slice(1), src.decimalComma);
    const f = freqOfColumn(src.grid, m.date);
    const s: RunSettings = { ...settings, freq: f, horizon: f ? DEFAULT_HORIZON[f] : settings.horizon };
    setSource(src);
    setMap(m);
    setSettings(s);
    setRun(null);
    setShowSettings(true);
    if (autoRun) void startRun(src, m, s);
  }

  async function onUpload(file: File) {
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const isXlsx = /\.xlsx$/i.test(file.name);
      const { grid, decimalComma } = isXlsx ? { grid: await gridFromXlsx(buf), decimalComma: false } : gridFromCsv(decodeText(buf));
      if (grid.length < 2) throw new Error("Faile turi būti antraštė ir bent viena eilutė.");
      track("planavimas_upload", { file_type: isXlsx ? "xlsx" : "csv", rows: grid.length - 1, cols: grid[0].length });
      loadGrid({ name: file.name, grid, decimalComma, demo: false }, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function loadDemo() {
    track("planavimas_demo");
    loadGrid({ name: "Pavyzdys: didmenininko savaitiniai pardavimai", grid: demoGrid(), decimalComma: false, demo: true }, true);
  }

  async function onExport(kind: "xlsx" | "csv") {
    if (!run || !pf || !source) return;
    setExporting(true);
    try {
      const ctx = {
        results: run.results,
        inputs,
        freq: run.prep.freq,
        last: run.prep.last,
        level: run.settings.level,
        checks: run.checks,
        portfolio: pf.rows,
        sourceName: source.name,
      };
      const date = new Date().toISOString().slice(0, 10);
      if (kind === "xlsx") download(await planWorkbook(ctx), `planas-${date}.xlsx`);
      else download(new Blob([planCsv(ctx)], { type: "text/csv;charset=utf-8" }), `planas-${date}.csv`);
      track("planavimas_export", { kind, items: run.results.length });
      setToast(true);
    } finally {
      setExporting(false);
    }
  }

  const fileInput = (label: string, className: string) => (
    <label className={className}>
      {label}
      <input
        type="file"
        accept=".csv,text/csv,.txt,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onUpload(f);
          e.target.value = "";
        }}
      />
    </label>
  );

  const warnCount = run ? run.checks.filter((c) => c.status !== "ok").length : 0;
  const prep = run?.prep;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <OutLink href={SITE_URL} className="brand-link">
            <img className="logo" src={`${import.meta.env.BASE_URL}mark.svg`} alt="" width={36} height={36} />
            <span className="wordmark">Statistikas.lt</span>
          </OutLink>
          <h1 className="product">Planavimas</h1>
          <span className="tagline">Nemokamas paklausos prognozavimas ir S&amp;OP naršyklėje</span>
        </div>
        <div className="top-actions">
          {fileInput("Įkelti CSV / Excel", "ghost-btn")}
          <button onClick={loadDemo}>Pavyzdys</button>
          <ContactLink source="topbar" className="ask-btn">
            Klausti statistiko
          </ContactLink>
        </div>
      </header>

      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}

      {!source && (
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-body">
            <span className="eyebrow">Pardavimų ir operacijų planavimas</span>
            <h2 id="hero-title">Paklausos prognozė visoms prekėms per kelias sekundes</h2>
            <p className="hero-lead">
              Įkelkite pardavimų istoriją iš ERP ar Excel. Įrankis patikrins duomenis, kiekvienai prekei parinks tiksliausią
              prognozės modelį, įvertins akcijų ir kainų poveikį ir paskaičiuos saugos atsargas.
            </p>
            <div className="hero-actions">
              {fileInput("Įkelti pardavimų failą", "primary-btn big-btn")}
              <button className="big-btn" onClick={loadDemo}>
                Išbandyti su pavyzdžiu →
              </button>
            </div>
            <p className="intro-privacy">Duomenys apdorojami tik jūsų naršyklėje ir niekur nesiunčiami.</p>
          </div>
          <div className="hero-steps">
            <div className="hero-step">
              <span className="step-num">1</span>
              <div>
                <strong>Duomenų patikra</strong>
                <p>trūkstamos datos, dublikatai, grąžinimai, spragos, išskirtys, nebeparduodamos prekės</p>
              </div>
            </div>
            <div className="hero-step">
              <span className="step-num">2</span>
              <div>
                <strong>Prognozė</strong>
                <p>
                  ETS, Theta, sezoninis profilis, Croston, SBA, TSB ir jų vidurkis – kiekvienai prekei parenkamas tiksliausias
                  pagal testą su istorija
                </p>
              </div>
            </div>
            <div className="hero-step">
              <span className="step-num">3</span>
              <div>
                <strong>S&amp;OP planas</strong>
                <p>ABC/XYZ, akcijų planas, kainos elastingumas, pajėgumai, saugos atsargos ir eksportas į Excel</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {!source && (
        <section className="panel" aria-labelledby="format-title">
          <div className="panel-head">
            <h2 id="format-title">Kokio failo reikia?</h2>
          </div>
          <p className="panel-sub">
            Vienas lapas, viena eilutė – vienas pardavimas ar prekės ir periodo suma. Stulpelių pavadinimai gali būti bet kokie –
            juos parinksite. Tinka dienos, savaitės ar mėnesio duomenys.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>data</th>
                  <th>prekė</th>
                  <th>grupė</th>
                  <th className="cell-num">kiekis</th>
                  <th className="cell-num">kaina</th>
                  <th className="cell-num">akcija</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>2026-09-07</td>
                  <td>Kava, pupelės 1 kg</td>
                  <td>Maistas</td>
                  <td className="cell-num">164</td>
                  <td className="cell-num">18,49</td>
                  <td className="cell-num">0</td>
                </tr>
                <tr>
                  <td>2026-09-14</td>
                  <td>Kava, pupelės 1 kg</td>
                  <td>Maistas</td>
                  <td className="cell-num">231</td>
                  <td className="cell-num">14,79</td>
                  <td className="cell-num">1</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="table-note">
            Privalomi tik <strong>data</strong> ir <strong>kiekis</strong>. Be prekės stulpelio prognozuojama bendra suma; kaina ir
            akcija leidžia įvertinti jų poveikį.{" "}
            <button
              className="link-btn"
              onClick={() => download(new Blob(["﻿" + demoCsv()], { type: "text/csv;charset=utf-8" }), "pavyzdys-pardavimai.csv")}
            >
              Atsisiųsti pavyzdinį CSV
            </button>
          </p>
        </section>
      )}

      {source && map && (
        <div className="dataset-bar">
          <div className="dataset-line">
            <div>
              <strong>{source.name}</strong>
              <p className="dataset-desc">
                {source.grid.length - 1} {ltPlural(source.grid.length - 1, ["eilutė", "eilutės", "eilučių"])}
                {prep
                  ? ` · ${prep.series.length} ${ltPlural(prep.series.length, ["prekė", "prekės", "prekių"])} · ${FREQ_LABEL[prep.freq]} · ` +
                    `istorija iki ${periodLabel(prep.last, prep.freq)}, prognozė ${run!.settings.horizon} per. į priekį`
                  : ""}
              </p>
            </div>
            {run && (
              <button className="link-btn" onClick={() => setShowSettings(!showSettings)} aria-expanded={showSettings}>
                {showSettings ? "Slėpti nustatymus ▾" : "Keisti stulpelius ir nustatymus ▸"}
              </button>
            )}
          </div>
        </div>
      )}

      {source && map && showSettings && (
        <MappingPanel
          header={source.grid[0]}
          preview={source.grid.slice(1, 6)}
          map={map}
          onMap={setMap}
          settings={settings}
          onSettings={setSettings}
          dataFreq={dataFreq}
          running={progress !== null}
          onRun={() => void startRun(source, map, settings)}
        />
      )}

      {progress && (
        <div className="progress" role="status">
          <span>
            Skaičiuojamos prognozės: {progress.done} / {progress.total}
          </span>
          <div className="progress-bar">
            <div style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%` }} />
          </div>
        </div>
      )}

      {run && pf && prep && (
        <>
          <nav className="tabs" role="tablist" aria-label="Rezultatai">
            {(
              [
                ["apzvalga", "Apžvalga"],
                ["prekes", "Prekės"],
                ["planas", "S&OP planas"],
                ["patikra", "Duomenų patikra"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={`tab${tab === id ? " tab-active" : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
                {id === "patikra" && warnCount > 0 && <span className="tab-badge">{warnCount}</span>}
              </button>
            ))}
          </nav>
          {tab === "apzvalga" && (
            <PortfolioView
              results={run.results}
              freq={prep.freq}
              last={prep.last}
              inputs={inputs}
              level={run.settings.level}
              rows={pf.rows}
              basis={pf.basis}
              onSelect={(item) => {
                setSelected(item);
                setTab("prekes");
                window.scrollTo({ top: 0 });
              }}
            />
          )}
          {tab === "prekes" && (
            <ItemsView
              results={run.results}
              rows={pf.rows}
              freq={prep.freq}
              last={prep.last}
              inputs={inputs}
              level={run.settings.level}
              selected={selected}
              onSelect={setSelected}
              onInputs={setInputs}
            />
          )}
          {tab === "planas" && (
            <PlanView
              results={run.results}
              freq={prep.freq}
              last={prep.last}
              inputs={inputs}
              level={run.settings.level}
              onInputs={setInputs}
              onExport={(k) => void onExport(k)}
              exporting={exporting}
            />
          )}
          {tab === "patikra" && (
            <div className="view">
              <AuditPanel
                checks={run.checks}
                summary={`Panaudotos ${prep.issues.rowsUsed} iš ${prep.issues.rowsTotal} eilučių.`}
              />
            </div>
          )}
        </>
      )}

      <CtaPanel />
      <SiteFooter />
      {toast && <ExportToast onClose={() => setToast(false)} />}
    </div>
  );
}
