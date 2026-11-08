import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { Chunk, Dataset } from "./types";
import { DEMOS, getDemo } from "./data/demos";
import type { Demo } from "./data/demos";
import { datasetFromCsv } from "./data/csv";
import { getTest, inputsReady } from "./stats/tests";
import { ChunkCard } from "./components/ChunkCard";
import { ChunkToc } from "./components/ChunkToc";
import { DataPreview } from "./components/DataPreview";
import { VariableEditor } from "./components/VariableEditor";
import { PrepPanel } from "./components/PrepPanel";
import { MethodsPanel } from "./components/MethodsPanel";
import { applyPrep, type PrepStep } from "./data/prep";
import { ContactLink, CtaPanel, ExportToast, IntroPanel, OutLink, SiteFooter } from "./components/Funnel";
import { readShareFromUrl, buildShareUrl, applyShareToVariables } from "./share";
import type { ShareState } from "./share";
import { SITE_URL } from "./site";
import {
  PROJECT_EXT,
  clearAutosave,
  downloadProject,
  loadAutosave,
  makeProject,
  parseProject,
  saveAutosave,
  type Project,
} from "./project";
import { track } from "./analytics";

let counter = 0;
const newId = () => `chunk-${++counter}`;

/** Demo chunks that showcase the demo dataset out of the box. */
function seedChunks(demo: Demo): Chunk[] {
  return demo.seed.map((c) => ({ id: newId(), ...c }));
}

function runChunk(chunk: Chunk, dataset: Dataset): Chunk {
  // An empty Table 1 is just unfinished, not an error.
  if (chunk.testId === "table1" && (chunk.picks.rowVars ?? "[]") === "[]")
    return { ...chunk, result: undefined, error: undefined };
  try {
    const test = getTest(chunk.testId);
    const result = test.run(dataset, chunk.picks);
    return { ...chunk, result, error: undefined };
  } catch (e) {
    return { ...chunk, result: undefined, error: (e as Error).message };
  }
}

export function App() {
  // The loaded data (with variable-editor changes); the prep steps derive what analyses see.
  const [rawDataset, setRawDataset] = useState<Dataset>(DEMOS[0].dataset);
  const [prepSteps, setPrepSteps] = useState<PrepStep[]>([]);
  const prep = useMemo(() => applyPrep(rawDataset, prepSteps), [rawDataset, prepSteps]);
  const dataset = prep.dataset;
  const [chunks, setChunks] = useState<Chunk[]>(() =>
    seedChunks(DEMOS[0]).map((c) => runChunk(c, DEMOS[0].dataset))
  );
  // Which built-in demo is loaded; null once the user uploads their own file.
  const [demoId, setDemoId] = useState<string | null>(DEMOS[0].id);
  const [busy, setBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<ShareState | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
  const [exportToast, setExportToast] = useState(false);
  // Work found in the browser autosave, offered for restore on arrival.
  const [autosaved, setAutosaved] = useState<Project | null>(null);

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

  // Read shareable link state from URL hash on first load; otherwise a deep link
  // (?demo=apklausa&test=cronbach, used by blog posts) or a previous autosave.
  useEffect(() => {
    const state = readShareFromUrl();
    if (state) {
      setPendingRestore(state);
      return;
    }
    const q = new URLSearchParams(window.location.search);
    const linkDemo = q.get("demo");
    const linkTest = q.get("test");
    if (linkDemo || linkTest) {
      openDeepLink(linkDemo, linkTest);
      return;
    }
    const saved = loadAutosave();
    if (saved) setAutosaved(saved);
  }, []);

  // Reactive: every change to a chunk (test or variable picks) recomputes it
  // immediately once all its inputs are filled — no "Run" button needed.
  const changeChunk = (next: Chunk) => {
    const test = getTest(next.testId);
    const ready = inputsReady(test, next.picks);
    const computed = ready ? runChunk(next, dataset) : { ...next, result: undefined, error: undefined };
    setChunks((cs) => cs.map((c) => (c.id === computed.id ? computed : c)));
  };
  const remove = (id: string) => setChunks((cs) => cs.filter((c) => c.id !== id));
  const addChunk = () => {
    track("analize_add_chunk");
    setChunks((cs) => [...cs, { id: newId(), testId: "descriptives", picks: {} }]);
  };

  // Any change to the analysed data (variable edits, prep steps) re-runs every chunk
  // that already ran, so results, descriptions and labels stay in sync.
  useEffect(() => {
    setChunks((cs) => cs.map((c) => (c.result || c.error ? runChunk(c, dataset) : c)));
  }, [dataset]);

  // Keep the user's own work in the browser (demos are always one click away).
  useEffect(() => {
    if (demoId !== null) return;
    const t = setTimeout(() => saveAutosave(makeProject(rawDataset, prepSteps, chunks)), 800);
    return () => clearTimeout(t);
  }, [demoId, rawDataset, prepSteps, chunks]);

  const openProject = (p: Project) => {
    const derived = applyPrep(p.dataset, p.prep).dataset;
    setRawDataset(p.dataset);
    setPrepSteps(p.prep);
    setDemoId(null);
    setAutosaved(null);
    setChunks(p.chunks.map((c) => runChunk({ id: newId(), ...c }, derived)));
  };

  const saveProject = () => {
    downloadProject(makeProject(rawDataset, prepSteps, chunks));
    track("analize_project_save");
  };

  function openDeepLink(demoParam: string | null, testParam: string | null) {
    const demo = demoParam ? getDemo(demoParam) : DEMOS[0];
    let test: ReturnType<typeof getTest> | null = null;
    try {
      test = testParam ? getTest(testParam) : null;
    } catch {
      test = null;
    }
    const seeded = seedChunks(demo);
    // Put the linked test first: the blog post's example, else its demo seed, else an empty block.
    const example = test ? demo.examples?.[test.id] : undefined;
    const seededLinked = test ? seeded.find((c) => c.testId === test!.id) : undefined;
    const linked = test
      ? example
        ? { id: newId(), testId: test.id, picks: example }
        : seededLinked ?? { id: newId(), testId: test.id, picks: {} }
      : null;
    const ordered = linked ? [linked, ...seeded.filter((c) => c !== linked)] : seeded;
    setDemoId(demo.id);
    setRawDataset(demo.dataset);
    setPrepSteps([]);
    setChunks(ordered.map((c) => runChunk(c, demo.dataset)));
    track("analize_deep_link", { dataset: demo.id, test_id: test?.id ?? "" });
  }

  const onUpload = async (file: File) => {
    try {
      if (file.name.toLowerCase().endsWith(PROJECT_EXT)) {
        openProject(parseProject(await file.text()));
        track("analize_project_load");
        return;
      }
      if (/\.xls$/i.test(file.name))
        throw new Error(
          "Senieji .xls failai nepalaikomi – atidarykite failą programoje Excel ir išsaugokite kaip .xlsx."
        );
      const baseName = file.name.replace(/\.(csv|xlsx|sav)$/i, "");
      const fileType = /\.xlsx$/i.test(file.name) ? "xlsx" : /\.sav$/i.test(file.name) ? "sav" : "csv";
      let ds =
        fileType === "xlsx"
          ? await (await import("./data/xlsx")).datasetFromXlsx(await file.arrayBuffer(), baseName)
          : fileType === "sav"
            ? (await import("./data/sav")).datasetFromSav(await file.arrayBuffer(), baseName)
            : datasetFromCsv(await file.text(), baseName);
      let steps: PrepStep[] = [];
      let nextChunks: Chunk[];

      if (pendingRestore) {
        ds = {
          ...ds,
          name: pendingRestore.datasetName ?? ds.name,
          description: pendingRestore.datasetDesc ?? ds.description,
          variables: applyShareToVariables(ds.variables, pendingRestore.variables),
        };
        steps = pendingRestore.prep ?? [];
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

      setRawDataset(ds);
      setPrepSteps(steps);
      setDemoId(null);
      setChunks(nextChunks.map((c) => runChunk(c, applyPrep(ds, steps).dataset)));
      // Only coarse counts — never file names, column names or values.
      if (fileType === "sav") track("analize_sav_import", { rows: ds.rows.length, cols: ds.variables.length });
      track("analize_upload", {
        file_type: fileType,
        rows: ds.rows.length,
        cols: ds.variables.length,
      });
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const loadDemo = (id: string) => {
    const demo = getDemo(id);
    track("analize_demo", { dataset: demo.id });
    setDemoId(demo.id);
    setRawDataset(demo.dataset);
    setPrepSteps([]);
    setChunks(seedChunks(demo).map((c) => runChunk(c, demo.dataset)));
  };

  const copyLink = () => {
    const state: ShareState = {
      datasetName: dataset.name,
      datasetDesc: dataset.description,
      variables: rawDataset.variables.map(({ key, label, type, valueLabels, unit }) => ({
        key,
        label,
        type,
        ...(valueLabels ? { valueLabels } : {}),
        ...(unit ? { unit } : {}),
      })),
      chunks: chunks.map(({ testId, picks }) => ({ testId, picks })),
      ...(prepSteps.length ? { prep: prepSteps } : {}),
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
      await exportToWord(dataset, chunks, prep.sentences.filter(Boolean));
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
    <>
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
            <label className="ghost-btn" title="CSV, Excel (.xlsx), SPSS (.sav) arba išsaugotas projektas (.statistikas)">
              Įkelti CSV / Excel / SPSS
              <input
                type="file"
                accept={`.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.sav,${PROJECT_EXT}`}
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="select-picker" title="Demonstraciniai duomenys">
              <span>Pavyzdys</span>
              <select
                value={demoId ?? ""}
                onChange={(e) => loadDemo(e.target.value)}
                aria-label="Demonstraciniai duomenys"
              >
                {demoId === null && (
                  <option value="" disabled>
                    Jūsų duomenys
                  </option>
                )}
                {DEMOS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="ghost-btn"
              onClick={saveProject}
              title="Atsisiųsti duomenis, paruošimo žingsnius ir analizės blokus vienu failu – vėliau jį galite vėl įkelti"
            >
              Išsaugoti projektą
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
          <VariableEditor dataset={rawDataset} onChange={setRawDataset} />
          <DataPreview dataset={dataset} />
        </div>

        <PrepPanel key={demoId ?? rawDataset.name} raw={rawDataset} steps={prepSteps} onChange={setPrepSteps} />

        <main className={`chunks${anyDragging ? " is-dragging" : ""}`}>
          {autosaved && (
            <div className="restore-banner">
              <span className="restore-icon" aria-hidden="true">↺</span>
              <div>
                <strong>Rasta neužbaigta analizė</strong> – „{autosaved.dataset.name}“,{" "}
                {new Date(autosaved.savedAt).toLocaleString("lt-LT")} (saugoma tik šioje naršyklėje).
                <button className="restore-dismiss" onClick={() => { openProject(autosaved); track("analize_project_load", { from: "autosave" }); }}>
                  Tęsti
                </button>
                <button className="restore-dismiss" onClick={() => { clearAutosave(); setAutosaved(null); }}>
                  Ištrinti
                </button>
              </div>
            </div>
          )}
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
              onAddPrep={(step) => {
                track("analize_prep_step", { step_type: step.kind, from: "prielaidos" });
                setPrepSteps((ps) => [...ps, step]);
              }}
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

        <MethodsPanel chunks={chunks} prepSentences={prep.sentences.filter(Boolean)} />

        <CtaPanel />

        <SiteFooter />
      </div>
      {exportToast && <ExportToast onClose={() => setExportToast(false)} />}
    </>
  );
}
