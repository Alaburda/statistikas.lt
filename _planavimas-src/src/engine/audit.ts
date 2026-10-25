// Data-quality report ("Duomenų patikra"): row-level problems found while
// reading the table plus series-level warnings that matter for planning.

import type { Prepared } from "./dataset";
import { type Freq, periodLabel } from "./periods";
import type { ItemResult } from "./pipeline";

export type CheckStatus = "ok" | "warn" | "fail";

export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  count: number;
  detail: string;
  examples: string[];
}

const MAX_SHOWN = 8;

function rowList(rows: number[]): string[] {
  return rows.slice(0, MAX_SHOWN).map((r) => `eilutė ${r}`);
}

function pct(part: number, whole: number): string {
  const v = whole ? (100 * part) / whole : 0;
  return `${v < 1 && v > 0 ? v.toFixed(1).replace(".", ",") : Math.round(v)} %`;
}

/** Periods of no sales at the end of a series that used to sell regularly. */
function trailingZeros(y: number[]): number {
  let k = 0;
  for (let t = y.length - 1; t >= 0 && y[t] === 0; t--) k++;
  return k;
}

export function auditChecks(prep: Prepared, results: ItemResult[] | null, m: number): Check[] {
  const { issues, series, freq } = prep;
  const checks: Check[] = [];
  const total = issues.rowsTotal;

  checks.push({
    id: "dates",
    title: "Datos",
    status: issues.badDate.length === 0 ? "ok" : issues.badDate.length / total > 0.05 ? "fail" : "warn",
    count: issues.badDate.length,
    detail: issues.badDate.length
      ? `${issues.badDate.length} eil. (${pct(issues.badDate.length, total)}) neatpažinta data – jos praleistos.`
      : "Visos datos atpažintos.",
    examples: rowList(issues.badDate),
  });
  checks.push({
    id: "qty",
    title: "Kiekiai",
    status: issues.missingQty.length === 0 ? "ok" : issues.missingQty.length / total > 0.05 ? "fail" : "warn",
    count: issues.missingQty.length,
    detail: issues.missingQty.length
      ? `${issues.missingQty.length} eil. be skaitinio kiekio – jos praleistos.`
      : "Visose eilutėse yra skaitinis kiekis.",
    examples: rowList(issues.missingQty),
  });
  checks.push({
    id: "negative",
    title: "Neigiami kiekiai (grąžinimai)",
    status: issues.negativeQty.length ? "warn" : "ok",
    count: issues.negativeQty.length,
    detail: issues.negativeQty.length
      ? `${issues.negativeQty.length} eil. su neigiamu kiekiu. Jie sumuojami su to paties periodo pardavimais` +
        (issues.clippedPeriods ? `; ${issues.clippedPeriods} period. suma liko neigiama ir prilyginta 0.` : ".")
      : "Neigiamų kiekių nėra.",
    examples: rowList(issues.negativeQty),
  });
  checks.push({
    id: "duplicates",
    title: "Pasikartojančios eilutės",
    status: issues.duplicates.length ? "warn" : "ok",
    count: issues.duplicates.length,
    detail: issues.duplicates.length
      ? `${issues.duplicates.length} eil. visiškai sutampa su ankstesne. Jos sumuojamos – jei tai dvigubas eksportas, paklausa bus pervertinta.`
      : "Visiškai sutampančių eilučių nėra.",
    examples: rowList(issues.duplicates),
  });
  if (prep.hasPrice || issues.badPrice.length) {
    checks.push({
      id: "price",
      title: "Kainos",
      status: issues.badPrice.length ? "warn" : "ok",
      count: issues.badPrice.length,
      detail: issues.badPrice.length
        ? `${issues.badPrice.length} eil. kaina nėra teigiamas skaičius – ji nenaudojama.`
        : "Visos nurodytos kainos teigiamos.",
      examples: rowList(issues.badPrice),
    });
  }
  if (issues.droppedPartial) {
    checks.push({
      id: "partial",
      title: "Nepilnas paskutinis periodas",
      status: "warn",
      count: 1,
      detail: `Duomenys baigiasi periodo viduryje (${issues.droppedPartial}). Šis periodas praleistas, kad nepilni pardavimai neatrodytų kaip kritimas.`,
      examples: [],
    });
  }

  const totalPeriods = series.reduce((s, x) => s + x.y.length, 0);
  const filled = series.reduce((s, x) => s + x.filled, 0);
  checks.push({
    id: "gaps",
    title: "Periodai be įrašų",
    status: filled === 0 ? "ok" : "warn",
    count: filled,
    detail: filled
      ? `${filled} prekės ir periodo derinių (${pct(filled, totalPeriods)}) neturi nė vieno įrašo – laikoma, kad pardavimų nebuvo (0).`
      : "Kiekviena prekė turi įrašą kiekvienam periodui.",
    examples: series
      .filter((x) => x.filled > 0)
      .slice(0, MAX_SHOWN)
      .map((x) => `${x.item}: ${x.filled}`),
  });

  const short = series.filter((x) => x.y.length < 2 * m);
  checks.push({
    id: "short",
    title: "Trumpa istorija",
    status: short.length ? "warn" : "ok",
    count: short.length,
    detail: short.length
      ? `${short.length} prek. turi mažiau nei du sezonus (${2 * m} period.) istorijos – sezoniškumo įvertinti nepavyks.`
      : "Visos prekės turi bent du sezonus istorijos.",
    examples: short.slice(0, MAX_SHOWN).map((x) => `${x.item}: ${x.y.length} per.`),
  });

  // Possibly discontinued: sold in ≥ 60 % of earlier periods, then ≥ 4 empty periods at the end.
  const stopped = series.filter((x) => {
    const z = trailingZeros(x.y);
    if (z < Math.max(4, Math.round(m / 6)) || z >= x.y.length) return false;
    const before = x.y.slice(0, x.y.length - z);
    return before.filter((v) => v > 0).length / before.length >= 0.6;
  });
  checks.push({
    id: "stopped",
    title: "Galimai nebeparduodamos prekės",
    status: stopped.length ? "warn" : "ok",
    count: stopped.length,
    detail: stopped.length
      ? `${stopped.length} prek. anksčiau parduotos reguliariai, bet pastaruoju metu – ne. Patikrinkite, ar jos neišimtos iš asortimento, ar nebuvo išparduotos (tuomet paklausa nematoma).`
      : "Reguliariai parduotos prekės pastaruoju metu parduodamos ir toliau.",
    examples: stopped.slice(0, MAX_SHOWN).map((x) => `${x.item}: ${trailingZeros(x.y)} per. be pardavimų`),
  });

  if (results) {
    const flagged = results.filter((r) => r.anomalies.length);
    const count = flagged.reduce((s, r) => s + r.anomalies.length, 0);
    checks.push({
      id: "anomalies",
      title: "Išskirtys",
      status: count ? "warn" : "ok",
      count,
      detail: count
        ? `${count} neįprastai didelių ar mažų reikšmių ${flagged.length} prek. eilutėse (daugiau nei 4 robastiniai SN nuo slankiosios medianos, akcijų periodai neįskaičiuoti). Patikrinkite, ar tai ne klaida, vienkartinis užsakymas ar prekių trūkumas.`
        : "Neįprastų reikšmių nerasta.",
      examples: flagged
        .flatMap((r) => r.anomalies.map((a) => `${r.item}, ${periodLabel(r.start + a.t, freq as Freq)}: ${fmtQty(a.value)} (tikėtina ~${fmtQty(a.expected)})`))
        .slice(0, MAX_SHOWN),
    });
  }
  return checks;
}

function fmtQty(v: number): string {
  return Math.round(v).toLocaleString("lt-LT");
}
