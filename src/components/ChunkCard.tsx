import type { Chunk, Dataset } from "../types";
import { TESTS, getTest } from "../stats/tests";
import { ResultView } from "./ResultView";
import { Table1Card } from "./Table1Card";

interface Props {
  chunk: Chunk;
  index: number;
  dataset: Dataset;
  onChange: (next: Chunk) => void;
  onRemove: (id: string) => void;
}

export function ChunkCard({ chunk, index, dataset, onChange, onRemove }: Props) {
  const test = getTest(chunk.testId);

  const setTest = (testId: string) => {
    onChange({ ...chunk, testId, picks: {}, result: undefined, error: undefined });
  };
  const setPick = (slotId: string, value: string) => {
    onChange({ ...chunk, picks: { ...chunk.picks, [slotId]: value }, error: undefined });
  };

  const allPicked = test.inputs.every((s) => chunk.picks[s.id]);

  const chunkHead = (
    <div className="chunk-head">
      <span className="chunk-num">{index + 1}</span>
      <select className="test-select" value={chunk.testId} onChange={(e) => setTest(e.target.value)}>
        {TESTS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button className="icon-btn" title="Remove chunk" onClick={() => onRemove(chunk.id)}>
        ✕
      </button>
    </div>
  );

  if (chunk.testId === "table1") {
    return (
      <div className="chunk">
        {chunkHead}
        <Table1Card chunk={chunk} dataset={dataset} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className="chunk">
      {chunkHead}
      <p className="chunk-blurb">{test.blurb}</p>

      <div className="picks">
        {test.inputs.map((slot) => {
          const options = dataset.variables.filter((v) => v.type === slot.accepts);
          return (
            <label className="pick" key={slot.id}>
              <span>
                {slot.label}
                <em className="pick-type">{slot.accepts}</em>
              </span>
              <select value={chunk.picks[slot.id] ?? ""} onChange={(e) => setPick(slot.id, e.target.value)}>
                <option value="">— choose —</option>
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
        <div className="chunk-hint">Pick all variables above — results update automatically.</div>
      )}

      {chunk.error && <div className="chunk-error">⚠ {chunk.error}</div>}
      {chunk.result && <ResultView result={chunk.result} />}
    </div>
  );
}
