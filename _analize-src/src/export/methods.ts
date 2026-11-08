// One coherent „Duomenų analizė“ paragraph for the whole report: software, data
// preparation, each distinct test (in report order), assumption checks and
// assumption-driven substitutions, significance level. Shared by the Word export
// and the on-page preview.
import type { Chunk } from "../types";
import { getTest } from "../stats/tests";
import { SITE_URL } from "../site";

export function toolCitation(year: number): string {
  return `Statistikas.lt. (${year}). Statistikas.lt Analizė: nemokama statistinė analizė naršyklėje [Kompiuterinė programa]. ${SITE_URL}/analize/`;
}

export function buildMethodsParagraph(chunks: Chunk[], prepSentences: string[], year: number): string {
  const done = chunks.filter((c) => c.result);
  if (done.length === 0) return "";
  const parts: string[] = [`Statistinė analizė atlikta naudojant Statistikas.lt Analizė (Statistikas.lt, ${year}).`];
  parts.push(...prepSentences);

  const seen = new Set<string>();
  for (const c of done) {
    if (seen.has(c.testId)) continue;
    seen.add(c.testId);
    const m = getTest(c.testId).methods;
    if (m) parts.push(m);
  }

  const switches = new Set<string>();
  for (const c of done) {
    if (!c.switchedFrom || c.switchedFrom === c.testId) continue;
    const key = `${c.switchedFrom}>${c.testId}`;
    if (switches.has(key)) continue;
    switches.add(key);
    const from = getTest(c.switchedFrom).name;
    const to = getTest(c.testId).name;
    parts.push(`Kai testo „${from}“ prielaidos nebuvo tenkinamos, vietoje jo taikytas „${to}“.`);
  }

  const labels = done.flatMap((c) => c.result!.assumptions ?? []).map((a) => a.label);
  const normality = labels.some((l) => l.startsWith("Normalumas") || l.startsWith("Skirtumų normalumas") || l.startsWith("Liekanų normalumas"));
  const variances = labels.some((l) => l.startsWith("Dispersijų lygybė"));
  if (normality && variances)
    parts.push("Normalumo prielaida tikrinta D'Agostino–Pearson K² testu, dispersijų lygybė – Levene (Brown–Forsythe) testu.");
  else if (normality) parts.push("Normalumo prielaida tikrinta D'Agostino–Pearson K² testu.");
  else if (variances) parts.push("Dispersijų lygybė tikrinta Levene (Brown–Forsythe) testu.");

  if (done.some((c) => c.result!.pValue !== undefined || c.testId === "cormatrix"))
    parts.push("Statistinio reikšmingumo lygmuo – α = 0,05.");
  return parts.join(" ");
}

/** Distinct reference-list entries: the tool, then each used test's citation. */
export function buildReferences(chunks: Chunk[], year: number): string[] {
  const refs = [toolCitation(year)];
  for (const c of chunks) {
    if (!c.result) continue;
    const apa = getTest(c.testId).apa;
    if (apa && !refs.includes(apa)) refs.push(apa);
  }
  return refs;
}
