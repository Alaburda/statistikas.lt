import { useRef, useState } from "react";
import type { Chunk, Dataset } from "../types";
import { TESTS, getTest } from "../stats/tests";
import { ResultView } from "./ResultView";
import { Table1Card } from "./Table1Card";
import { ContactLink, OutLink } from "./Funnel";
import { typeLabel } from "./labels";
import { track } from "../analytics";

interface Props {
  chunk: Chunk;
  index: number;
  dataset: Dataset;
  onChange: (next: Chunk) => void;
  onRemove: (id: string) => void;
  dragOverPos: "before" | "after" | null;
  onDragStart: () => void;
  onDragOver: (pos: "before" | "after") => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export function ChunkCard({ chunk, index, dataset, onChange, onRemove, dragOverPos, onDragStart, onDragOver, onDrop, onDragEnd }: Props) {
  const test = getTest(chunk.testId);
  const canDrag = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const setTest = (testId: string) => {
    track("analize_test_selected", { test_id: testId });
    onChange({ ...chunk, testId, picks: {}, result: undefined, error: undefined });
  };
  const setPick = (slotId: string, value: string) => {
    onChange({ ...chunk, picks: { ...chunk.picks, [slotId]: value }, error: undefined });
  };

  const allPicked = test.inputs.every((s) =>
    s.multi
      ? (chunk.picks[s.id] ?? "").split(",").filter(Boolean).length > 0
      : !!chunk.picks[s.id]
  );

  const dragProps = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      if (!canDrag.current) { e.preventDefault(); return; }
      e.dataTransfer.effectAllowed = "move";
      const header = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(".chunk-head");
      if (header) e.dataTransfer.setDragImage(header, 40, Math.round(header.offsetHeight / 2));
      setIsDragging(true);
      onDragStart();
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onDragOver(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
    },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); onDrop(); },
    onDragEnd: () => { canDrag.current = false; setIsDragging(false); onDragEnd(); },
  };

  const handle = (
    <span
      className="drag-handle"
      title="Vilkite, kad pakeistumėte eilės tvarką"
      aria-label="Vilkite, kad pakeistumėte eilės tvarką"
      onMouseDown={() => { canDrag.current = true; }}
      onMouseUp={() => { canDrag.current = false; }}
    >
      ⠿
    </span>
  );

  const chunkHead = (
    <div className="chunk-head">
      {handle}
      <span className="chunk-num">{index + 1}</span>
      <select className="test-select" value={chunk.testId} onChange={(e) => setTest(e.target.value)}>
        {TESTS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button className="icon-btn" title="Pašalinti analizės bloką" aria-label="Pašalinti analizės bloką" onClick={() => onRemove(chunk.id)}>
        ✕
      </button>
    </div>
  );

  const cls = [
    "chunk",
    isDragging ? "is-dragging" : "",
    dragOverPos === "before" ? "drag-over-before" : dragOverPos === "after" ? "drag-over-after" : "",
  ].filter(Boolean).join(" ");

  if (chunk.testId === "table1") {
    return (
      <div id={chunk.id} className={cls} {...dragProps}>
        {chunkHead}
        <Table1Card chunk={chunk} dataset={dataset} onChange={onChange} />
      </div>
    );
  }

  return (
    <div id={chunk.id} className={cls} {...dragProps}>
      {chunkHead}
      <p className="chunk-blurb">
        {test.blurb}
        {test.guide && (
          <>
            {" "}
            <OutLink href={test.guide.url} location="guide" className="guide-link">
              Plačiau: {test.guide.title} →
            </OutLink>
          </>
        )}
      </p>

      <div className="picks">
        {test.inputs.map((slot) => {
          const options =
            slot.accepts === "any"
              ? dataset.variables
              : dataset.variables.filter((v) => v.type === slot.accepts);
          const acceptsLabel = typeLabel(slot.accepts);
          if (slot.multi) {
            const selected = new Set((chunk.picks[slot.id] ?? "").split(",").filter(Boolean));
            const toggle = (key: string, on: boolean) => {
              const next = on ? [...selected, key] : [...selected].filter((k) => k !== key);
              setPick(slot.id, next.join(","));
            };
            return (
              <label className="pick" key={slot.id}>
                <span>
                  {slot.label}
                  <em className="pick-type">{acceptsLabel}</em>
                </span>
                <div className="multi-pick">
                  {options.length === 0 && (
                    <span className="multi-pick-empty">Tinkamų kintamųjų nėra.</span>
                  )}
                  {options.map((v) => (
                    <label key={v.key} className="multi-pick-item">
                      <input
                        type="checkbox"
                        checked={selected.has(v.key)}
                        onChange={(e) => toggle(v.key, e.target.checked)}
                      />
                      {v.label}
                    </label>
                  ))}
                </div>
              </label>
            );
          }
          return (
            <label className="pick" key={slot.id}>
              <span>
                {slot.label}
                <em className="pick-type">{acceptsLabel}</em>
              </span>
              <select value={chunk.picks[slot.id] ?? ""} onChange={(e) => setPick(slot.id, e.target.value)}>
                <option value="">— pasirinkite —</option>
                {options.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      {!allPicked && (
        <div className="chunk-hint">Pasirinkite visus kintamuosius – rezultatai atsinaujins automatiškai.</div>
      )}

      {chunk.error && <div className="chunk-error">⚠ {chunk.error}</div>}
      {chunk.result?.assumptions && chunk.result.assumptions.length > 0 && (
        <div className="assumptions">
          <div className="assumptions-title">Prielaidų patikra</div>
          {chunk.result.assumptions.map((a, i) => (
            <div key={i} className={`assumption assumption-${a.status}`}>
              <span className="assumption-icon">
                {a.status === "pass" ? "✓" : a.status === "warn" ? "⚠" : "✕"}
              </span>
              <span>
                <strong>{a.label}.</strong> {a.detail}{" "}
                {a.switchTo && (
                  <button
                    className="assumption-switch"
                    onClick={() =>
                      onChange({
                        ...chunk,
                        testId: a.switchTo!.testId,
                        picks: a.switchTo!.picks,
                        result: undefined,
                        error: undefined,
                      })
                    }
                  >
                    {a.switchTo.label} →
                  </button>
                )}
              </span>
            </div>
          ))}
          {chunk.result.assumptions.some((a) => a.status !== "pass") && (
            <p className="assumption-hint">
              Nesate tikri, ar šis testas tinka jūsų duomenims?{" "}
              <ContactLink source="prielaidos">Paklauskite statistiko →</ContactLink>
            </p>
          )}
        </div>
      )}
      {chunk.result && <ResultView result={chunk.result} />}
    </div>
  );
}
