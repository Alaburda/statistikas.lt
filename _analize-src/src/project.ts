// Saving work: a downloadable project file (.statistikas, JSON) and a browser autosave.
// Both hold the data, prep steps and analysis blocks – and both stay on the user's device.
import type { Chunk, Dataset } from "./types";
import type { PrepStep } from "./data/prep";

export const PROJECT_EXT = ".statistikas";
const AUTOSAVE_KEY = "analize-autosave-v1";

export interface Project {
  app: "statistikas-analize";
  version: 1;
  savedAt: string;
  dataset: Dataset;
  prep: PrepStep[];
  chunks: Pick<Chunk, "testId" | "picks" | "switchedFrom">[];
}

export function makeProject(dataset: Dataset, prep: PrepStep[], chunks: Chunk[]): Project {
  return {
    app: "statistikas-analize",
    version: 1,
    savedAt: new Date().toISOString(),
    dataset,
    prep,
    chunks: chunks.map(({ testId, picks, switchedFrom }) => ({ testId, picks, ...(switchedFrom ? { switchedFrom } : {}) })),
  };
}

export function parseProject(text: string): Project {
  let p: Project;
  try {
    p = JSON.parse(text);
  } catch {
    throw new Error("Projekto failas sugadintas (netinkamas JSON).");
  }
  if (p?.app !== "statistikas-analize" || !p.dataset || !Array.isArray(p.dataset.rows) || !Array.isArray(p.dataset.variables))
    throw new Error("Tai ne Statistikas.lt Analizė projekto failas.");
  if (p.version !== 1) throw new Error("Projekto failas sukurtas naujesne programos versija – atnaujinkite puslapį.");
  return { ...p, prep: Array.isArray(p.prep) ? p.prep : [], chunks: Array.isArray(p.chunks) ? p.chunks : [] };
}

export function downloadProject(p: Project): void {
  const blob = new Blob([JSON.stringify(p)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = p.dataset.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "analize";
  a.href = url;
  a.download = `${safe}${PROJECT_EXT}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Best effort: storage can be full, disabled or unavailable (private mode). */
export function saveAutosave(p: Project): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function loadAutosave(): Project | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? parseProject(raw) : null;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}
