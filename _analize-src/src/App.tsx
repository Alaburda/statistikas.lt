import { useEffect, useRef, useState, useCallback } from "react";
import type { Chunk, Dataset } from "./types";
import { birthwt } from "./data/birthwt";
import { datasetFromCsv } from "./data/csv";
import { getTest } from "./stats/tests";
import { ChunkCard } from "./components/ChunkCard";
import { ChunkToc } from "./components/ChunkToc";
import { DataPreview } from "./components/DataPreview";
import { VariableEditor } from "./components/VariableEditor";
import { ContactLink, CtaPanel, ExportToast, IntroPanel, OutLink, SiteFooter } from "./components/Funnel";
import { THEMES, ThemeContext, getTheme } from "./theme";
import { readShareFromUrl, buildShareUrl, applyShareToVariables } from "./share";
import type { ShareState } from "./share";
import { SITE_URL } from "./site";
import { track } from "./analytics";

let counter = 0;
const newId = () => `chunk-${++counter}`;

/** Demo chunks that showcase the dataset out of the box. */
function seedChunks(): Chunk[] {
  return [
    { id: newId(), testId: "ttest", picks: { outcome: "bwt", group: "smoke" } },
    { id: newId(), testId: "chisq", picks: { rowVar: "low", colVar: "smoke" } },
    { id: newId(), testId: "correlation", picks: { x: "lwt", y: "bwt" } },
    { id: newId(), testId: "anova", picks: { outcome: "bwt", group: "race" } },
    { id: newId(), testId: "logistic", picks: { outcome: "low", predictors: "age,lwt,smoke" } },
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
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
  const [exportToast, setExportToast] = useState(false);

  // Track which chunk is in the top portion of the viewport for the ToC highlight.
  const chunkIds = chunks.map((c) => c.id).join(",");
  const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    const hit = entries.find((e) => e.isIntersecting);
    if (hit) setActiveChunkId(hit.target.id);
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: "-80px 0px -55% 0px",
      threshold: 0,
    });
    chunkIds.split(",").filter(Boolean).forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkIds, handleIntersect]);

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
  const addChunk = () => {
    track("analize_add_chunk");
    setChunks((cs) => [...cs, { id: newId(), testId: "descriptives", picks: {} }]);
  };

  // Editing variables (rename / recode / retype) re-runs any chunk that already ran,
  // so descriptions and labels stay in sync with the new metadata.
  const updateDataset = (next: Dataset) => {
    setDataset(next);
    setChunks((cs) => cs.map((c) => (c.result || c.error ? runChunk(c, next) : c)));
  };

  const onUpload = async (file: File) => {
    try {
      if (/\.xls$/i.test(file.name))
        throw new Error(
          "Senieji .xls failai nepalaikomi – atidarykite failą programoje Excel ir išsaugokite kaip .xlsx."
        );
      const baseName = file.name.replace(/\.(csv|xlsx)$/i, "");
      const isXlsx = /\.xlsx$/i.test(file.name);
      let ds = isXlsx
        ? await (await import("./data/xlsx")).datasetFromXlsx(await file.arrayBuffer(), baseName)
        : datasetFromCsv(await file.text(), baseName);
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
      // Only coarse counts — never file names, column names or values.
      track("analize_upload", {
        file_type: isXlsx ? "xlsx" : "csv",
        rows: ds.rows.length,
        cols: ds.variables.length,
      });
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const loadDemo = () => {
    track("analize_demo");
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
      track("analize_share_link");
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  const completed = chunks.filter((c) => c.result).length;

  const onExport = async () => {
    setBusy(true);
    try {
      // Loaded on demand: the docx library is the bulk of the bundle.
      const { exportToWord } = await import("./export/word");
      await exportToWord(dataset, chunks, theme);
      track("analize_export_word", { chunks: completed });
      setExportToast(true);
    } catch (e) {
      alert(`Nepavyko sukurti Word ataskaitos: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const dragSrcIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<{ idx: number; pos: "before" | "after" } | null>(null);
  const [anyDragging, setAnyDragging] = useState(false);

  const handleDrop = (dest: number) => {
    const src = dragSrcIdx.current;
    if (src !== null && dragOver !== null) {
      // insertIdx is the desired final position in the original array.
      const insertIdx = dragOver.pos === "after" ? dest + 1 : dest;
      setChunks((cs) => {
        const next = [...cs];
        const [moved] = next.splice(src, 1);
        // After removing src, indices above src shift down by 1.
        next.splice(insertIdx > src ? insertIdx - 1 : insertIdx, 0, moved);
        return next;
      });
    }
    dragSrcIdx.current = null;
    setDragOver(null);
    setAnyDragging(false);
  };

  return (
    <ThemeContext.Provider value={theme}>
      <ChunkToc chunks={chunks} activeId={activeChunkId} />
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <OutLink href={SITE_URL} className="brand-link">
              <img
                className="logo"
                src={`${import.meta.env.BASE_URL}mark.svg`}
                alt=""
                width={36}
                height={36}
              />
              <span className="wordmark">Statistikas.lt</span>
            </OutLink>
            <h1 className="product">Analizė</h1>
            <span className="tagline">Nemokama statistinė analizė naršyklėje</span>
          </div>
          <div className="top-actions">
            <label className="theme-picker" title="Lentelių ir diagramų tema">
              <span>Tema</span>
              <select
                value={themeId}
                onChange={(e) => setThemeId(e.target.value)}
                aria-label="Lentelių ir diagramų tema"
              >
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ghost-btn">
              Įkelti CSV / Excel
              <input
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button className="ghost-btn" onClick={loadDemo}>
              Demonstraciniai duomenys
            </button>
            <button className="ghost-btn" onClick={copyLink}>
              {copied ? "✓ Nukopijuota" : "Kopijuoti nuorodą"}
            </button>
            <button className="primary-btn" onClick={onExport} disabled={busy || completed === 0}>
              {busy ? "Ruošiama…" : `Atsisiųsti Word (${completed})`}
            </button>
            <ContactLink source="topbar" className="ask-btn">
              Klausti statistiko
            </ContactLink>
          </div>
        </header>

        <IntroPanel />

        <div className="dataset-bar">
          <div>
            <strong>{dataset.name}</strong>
            <p className="dataset-desc">{dataset.description}</p>
          </div>
          <VariableEditor dataset={dataset} onChange={updateDataset} />
          <DataPreview dataset={dataset} />
        </div>

        <main className={`chunks${anyDragging ? " is-dragging" : ""}`}>
          {pendingRestore && (
            <div className="restore-banner">
              <span className="restore-icon" aria-hidden="true">↗</span>
              <div>
                <strong>Nuoroda atidaryta</strong> – įkelkite savo duomenų failą, kad atkurtumėte analizę.
                <button className="restore-dismiss" onClick={() => { setPendingRestore(null); window.location.hash = ""; }}>
                  Atsisakyti
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
              dragOverPos={dragOver?.idx === i ? dragOver.pos : null}
              onDragStart={() => { dragSrcIdx.current = i; setAnyDragging(true); }}
              onDragOver={(pos) => setDragOver({ idx: i, pos })}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { dragSrcIdx.current = null; setDragOver(null); setAnyDragging(false); }}
            />
          ))}
          <button className="add-chunk" onClick={addChunk}>
            + Pridėti analizės bloką
          </button>
        </main>

        <CtaPanel />

        <SiteFooter />
      </div>
      {exportToast && <ExportToast onClose={() => setExportToast(false)} />}
    </ThemeContext.Provider>
  );
}
