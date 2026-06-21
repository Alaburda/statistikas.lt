import { useEffect, useRef, useState } from "react";
import type { Chunk, Dataset } from "./types";
import { birthwt } from "./data/birthwt";
import { datasetFromCsv } from "./data/csv";
import { getTest } from "./stats/tests";
import { exportToWord } from "./export/word";
import { ChunkCard } from "./components/ChunkCard";
import { DataPreview } from "./components/DataPreview";
import { VariableEditor } from "./components/VariableEditor";
import { THEMES, ThemeContext, getTheme } from "./theme";
import { readShareFromUrl, buildShareUrl, applyShareToVariables } from "./share";
import type { ShareState } from "./share";

let counter = 0;
const newId = () => `chunk-${++counter}`;

/** Demo chunks that showcase the dataset out of the box. */
function seedChunks(): Chunk[] {
  return [
    { id: newId(), testId: "ttest", picks: { outcome: "bwt", group: "smoke" } },
    { id: newId(), testId: "chisq", picks: { rowVar: "low", colVar: "smoke" } },
    { id: newId(), testId: "correlation", picks: { x: "lwt", y: "bwt" } },
    { id: newId(), testId: "anova", picks: { outcome: "bwt", group: "race" } },
  ];
}

function runChunk(chunk: Chunk, dataset: Dataset): Chunk {
  try {
    const test = getTest(chunk.testId);
    const result = test.run(dataset, chunk.picks);
    return { ...chunk, result, error: undefined };
  } catch (e) {
    return { ...chunk, result: undefined, error: (e as Error).message };
  }
}

export function App() {
  const [dataset, setDataset] = useState<Dataset>(birthwt);
  const [chunks, setChunks] = useState<Chunk[]>(() =>
    seedChunks().map((c) => runChunk(c, birthwt))
  );
  const [busy, setBusy] = useState(false);
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const theme = getTheme(themeId);
  const [pendingRestore, setPendingRestore] = useState<ShareState | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read shareable link state from URL hash on first load.
  useEffect(() => {
    const state = readShareFromUrl();
    if (state) {
      setPendingRestore(state);
      if (state.themeId) setThemeId(state.themeId);
    }
  }, []);

  // Apply theme to the whole UI (chrome + tables) via CSS custom properties.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--brand", theme.ui.brand);
    root.setProperty("--brand-dark", theme.ui.brandDark);
    root.setProperty("--accent", theme.ui.accent);
    root.setProperty("--th-bg", theme.ui.thBg);
    root.setProperty("--th-text", theme.ui.thText);
    root.setProperty("--row-stripe", theme.ui.rowStripe);
  }, [theme]);

  // Reactive: every change to a chunk (test or variable picks) recomputes it
  // immediately once all its inputs are filled — no "Run" button needed.
  const changeChunk = (next: Chunk) => {
    // Table 1 manages its own output reactively inside Table1Card.
    if (next.testId === "table1") {
      setChunks((cs) => cs.map((c) => (c.id === next.id ? next : c)));
      return;
    }
    const test = getTest(next.testId);
    const ready = test.inputs.every((s) => next.picks[s.id]);
    const computed = ready ? runChunk(next, dataset) : { ...next, result: undefined, error: undefined };
    setChunks((cs) => cs.map((c) => (c.id === computed.id ? computed : c)));
  };
  const remove = (id: string) => setChunks((cs) => cs.filter((c) => c.id !== id));
  const addChunk = () =>
    setChunks((cs) => [...cs, { id: newId(), testId: "descriptives", picks: {} }]);

  // Editing variables (rename / recode / retype) re-runs any chunk that already ran,
  // so descriptions and labels stay in sync with the new metadata.
  const updateDataset = (next: Dataset) => {
    setDataset(next);
    setChunks((cs) => cs.map((c) => (c.result || c.error ? runChunk(c, next) : c)));
  };

  const onUpload = async (file: File) => {
    const text = await file.text();
    try {
      let ds = datasetFromCsv(text, file.name.replace(/\.csv$/i, ""));
      let nextChunks: Chunk[];

      if (pendingRestore) {
        ds = {
          ...ds,
          name: pendingRestore.datasetName ?? ds.name,
          description: pendingRestore.datasetDesc ?? ds.description,
          variables: applyShareToVariables(ds.variables, pendingRestore.variables),
        };
        nextChunks = pendingRestore.chunks.map((c) => ({
          id: newId(),
          testId: c.testId,
          picks: c.picks,
        }));
        setPendingRestore(null);
        window.location.hash = "";
      } else {
        nextChunks = [{ id: newId(), testId: "descriptives", picks: {} }];
      }

      setDataset(ds);
      setChunks(nextChunks.map((c) => runChunk(c, ds)));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const loadDemo = () => {
    setDataset(birthwt);
    setChunks(seedChunks().map((c) => runChunk(c, birthwt)));
  };

  const copyLink = () => {
    const state: ShareState = {
      themeId,
      datasetName: dataset.name,
      datasetDesc: dataset.description,
      variables: dataset.variables.map(({ key, label, type, valueLabels, unit }) => ({
        key,
        label,
        type,
        ...(valueLabels ? { valueLabels } : {}),
        ...(unit ? { unit } : {}),
      })),
      chunks: chunks.map(({ testId, picks }) => ({ testId, picks })),
    };
    const url = buildShareUrl(state);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  const onExport = async () => {
    setBusy(true);
    try {
      await exportToWord(dataset, chunks, theme);
    } finally {
      setBusy(false);
    }
  };

  const completed = chunks.filter((c) => c.result).length;

  return (
    <ThemeContext.Provider value={theme}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="logo">σ</span>
            <div>
              <h1>SPSS Killer</h1>
              <span className="tagline">Browser-first statistics, one chunk at a time</span>
            </div>
          </div>
          <div className="top-actions">
            <label className="theme-picker" title="Table & plot theme">
              🎨
              <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ghost-btn">
              ⬆ Upload CSV
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
              />
            </label>
            <button className="ghost-btn" onClick={loadDemo}>
              ⟳ Load demo
            </button>
            <button className="ghost-btn" onClick={copyLink}>
              {copied ? "✓ Copied!" : "🔗 Copy link"}
            </button>
            <button className="primary-btn" onClick={onExport} disabled={busy || completed === 0}>
              {busy ? "Exporting…" : `⬇ Export to Word (${completed})`}
            </button>
          </div>
        </header>

        <div className="dataset-bar">
          <div>
            <strong>{dataset.name}</strong>
            <p className="dataset-desc">{dataset.description}</p>
          </div>
          <VariableEditor dataset={dataset} onChange={updateDataset} />
          <DataPreview dataset={dataset} />
        </div>

        <main className="chunks">
          {pendingRestore && (
            <div className="restore-banner">
              <span className="restore-icon">🔗</span>
              <div>
                <strong>Link loaded</strong> — upload your CSV to restore your analysis.
                <button className="restore-dismiss" onClick={() => { setPendingRestore(null); window.location.hash = ""; }}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {chunks.map((chunk, i) => (
            <ChunkCard
              key={chunk.id}
              chunk={chunk}
              index={i}
              dataset={dataset}
              onChange={changeChunk}
              onRemove={remove}
            />
          ))}
          <button className="add-chunk" onClick={addChunk}>
            + Add analysis chunk
          </button>
        </main>

        <footer className="foot">
          All statistics run locally in your browser — no data leaves this page. Demo dataset:
          MASS::birthwt (R).
        </footer>
      </div>
    </ThemeContext.Provider>
  );
}
