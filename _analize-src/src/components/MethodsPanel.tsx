import { useState } from "react";
import type { Chunk } from "../types";
import { buildMethodsParagraph, buildReferences } from "../export/methods";
import { track } from "../analytics";

/** The report's „Duomenų analizė“ paragraph and references, ready to copy into a thesis. */
export function MethodsPanel({ chunks, prepSentences }: { chunks: Chunk[]; prepSentences: string[] }) {
  const [copied, setCopied] = useState(false);
  const year = new Date().getFullYear();
  const text = buildMethodsParagraph(chunks, prepSentences, year);
  if (!text) return null;
  const refs = buildReferences(chunks, year);

  const copy = () => {
    navigator.clipboard.writeText(`${text}\n\nLiteratūra\n${refs.join("\n")}`).then(() => {
      track("analize_methods_copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className="methods-panel" aria-labelledby="methods-title">
      <div className="methods-head">
        <h2 id="methods-title">Duomenų analizė</h2>
        <button className="ghost-btn" onClick={copy}>
          {copied ? "✓ Nukopijuota" : "Kopijuoti tekstą"}
        </button>
      </div>
      <p className="methods-text">{text}</p>
      <ol className="methods-refs">
        {refs.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ol>
      <p className="prep-help">
        Šis metodų aprašas sudarytas automatiškai pagal jūsų analizės blokus ir duomenų paruošimo žingsnius; jis įtraukiamas ir į
        Word ataskaitą.
      </p>
    </section>
  );
}
