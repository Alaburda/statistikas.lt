import { getTest } from "../stats/tests";
import type { Chunk } from "../types";

interface Props {
  chunks: Chunk[];
  activeId: string | null;
}

export function ChunkToc({ chunks, activeId }: Props) {
  if (chunks.length === 0) return null;

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const topbar = document.querySelector<HTMLElement>(".topbar");
    const offset = (topbar?.getBoundingClientRect().height ?? 80) + 12;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <nav className="chunk-toc" aria-label="Analizės turinys">
      <p className="toc-heading">Turinys</p>
      {chunks.map((chunk, i) => {
        const test = getTest(chunk.testId);
        const status = chunk.result ? "done" : chunk.error ? "error" : "pending";
        return (
          <button
            key={chunk.id}
            className={`toc-item${chunk.id === activeId ? " toc-active" : ""}`}
            onClick={() => scrollTo(chunk.id)}
            title={test.name}
          >
            <span className="toc-num">{i + 1}</span>
            <span className="toc-name">{test.name}</span>
            <span className={`toc-dot toc-${status}`} />
          </button>
        );
      })}
    </nav>
  );
}
