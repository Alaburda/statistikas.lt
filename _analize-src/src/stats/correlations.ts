// Spearman's rank correlation and the APA-style correlation matrix.
import type { AnalysisResult, Dataset, TestDefinition } from "../types";
import { tTwoTailedP } from "./distributions";
import { describeR, fmt, fmtP, fmtPInline, significanceNote, stars } from "./format";
import { getVar, mean, pairedNumeric, rankWithTies, sd } from "./helpers";

/** Pearson r of two equally long arrays. */
export function pearson(x: number[], y: number[]): number {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Correlation with its two-tailed p-value. Spearman's ρ is Pearson's r on mid-ranks;
 * its p-value uses the t approximation with n − 2 df (as SPSS; R: exact = FALSE).
 */
export function correlate(x: number[], y: number[], method: "pearson" | "spearman") {
  const n = x.length;
  const r = method === "spearman" ? pearson(rankWithTies(x).ranks, rankWithTies(y).ranks) : pearson(x, y);
  const df = n - 2;
  const t = Math.abs(r) >= 1 ? Infinity : r * Math.sqrt(df / (1 - r * r));
  const p = Number.isFinite(t) ? tTwoTailedP(t, df) : 0;
  return { r, t, df, p, n };
}

const METHOD_CHOICES = [
  { value: "pearson", label: "Pirsono r" },
  { value: "spearman", label: "Spirmeno ρ" },
];

export const spearman: TestDefinition = {
  id: "spearman",
  name: "Spirmeno koreliacija",
  blurb: "Įvertina monotoninį ryšį tarp dviejų kiekybinių ar ranginių kintamųjų (pvz., Likerto skalių); nereikalauja normalumo.",
  methods:
    "Ryšiams tarp ranginių ar nenormaliai pasiskirsčiusių kintamųjų įvertinti apskaičiuoti Spirmeno ranginės koreliacijos koeficientai (ρ).",
  guide: {
    title: "Spirmeno koreliacija: kada rinktis ρ?",
    url: "https://statistikas.lt/posts/spirmeno-koreliacija/spirmeno-koreliacija.html",
  },
  inputs: [
    { id: "x", label: "Kintamasis X", accepts: "any" },
    { id: "y", label: "Kintamasis Y", accepts: "any" },
  ],
  run: (ds, picks): AnalysisResult => {
    const xv = getVar(ds, picks.x);
    const yv = getVar(ds, picks.y);
    const { x, y } = pairedNumeric(ds, picks.x, picks.y);
    if (x.length < 4) throw new Error("Spirmeno koreliacijai reikia bent 4 stebėjimų su abiem reikšmėmis.");
    const c = correlate(x, y, "spearman");
    return {
      pValue: c.p,
      stats: { rho: c.r, t: c.t, df: c.df, p: c.p, n: c.n },
      assumptions: [
        {
          label: "Monotoniškumas",
          status: "pass",
          detail:
            "Spirmeno ρ nereikalauja normalumo, tačiau daro prielaidą, kad ryšys monotoninis (viena kryptimi) – patikrinkite sklaidos diagramą.",
        },
      ],
      description:
        `Tarp kintamųjų „${xv.label}“ ir „${yv.label}“ (n = ${c.n}) stebima ${describeR(Math.abs(c.r))} ` +
        `${c.r >= 0 ? "teigiama" : "neigiama"} ranginė koreliacija: ρ = ${fmt(c.r)}. ` +
        `Ryšys yra ${significanceNote(c.p)}: p ${fmtPInline(c.p)}.`,
      tables: [
        {
          title: "Spirmeno koreliacija",
          columns: ["ρ", "n", "p"],
          rows: [[fmt(c.r), c.n, fmtP(c.p)]],
        },
      ],
      plot: {
        kind: "scatter",
        title: `Kintamojo „${yv.label}“ priklausomybė nuo „${xv.label}“`,
        xLabel: xv.label,
        yLabel: yv.label,
        points: x.map((xi, i) => ({ x: xi, y: y[i] })),
      },
    };
  },
};

export const corMatrix: TestDefinition = {
  id: "cormatrix",
  name: "Koreliacijų matrica",
  blurb: "Kelių kintamųjų (pvz., skalių) tarpusavio koreliacijos vienoje APA lentelėje su vidurkiais ir SN.",
  methods:
    "Kintamųjų tarpusavio ryšiams įvertinti apskaičiuota koreliacijų matrica (trūkstamos reikšmės šalintos poromis).",
  guide: {
    title: "Koreliacijų matrica pagal APA",
    url: "https://statistikas.lt/posts/koreliaciju-matrica-apa/koreliaciju-matrica-apa.html",
  },
  inputs: [
    { id: "vars", label: "Kintamieji (2 ar daugiau)", accepts: "any", multi: true },
    { id: "method", label: "Koeficientas", accepts: "any", choices: METHOD_CHOICES },
  ],
  run: (ds: Dataset, picks): AnalysisResult => {
    const keys = (picks.vars ?? "").split(",").filter(Boolean);
    if (keys.length < 2) throw new Error("Pasirinkite bent du kintamuosius.");
    const method = picks.method === "spearman" ? "spearman" : "pearson";
    const sym = method === "spearman" ? "ρ" : "r";
    const vars = keys.map((k) => getVar(ds, k));
    const stats: Record<string, number> = {};
    const cells: { r: number; p: number; n: number }[][] = keys.map(() => []);
    let nMin = Infinity;
    let nMax = 0;
    const sigPairs: string[] = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = 0; j < i; j++) {
        const { x, y } = pairedNumeric(ds, keys[i], keys[j]);
        if (x.length < 4) throw new Error(`Porai „${vars[i].label}“ ir „${vars[j].label}“ trūksta duomenų (n = ${x.length}).`);
        const c = correlate(x, y, method);
        cells[i][j] = { r: c.r, p: c.p, n: c.n };
        stats[`r_${keys[i]}_${keys[j]}`] = c.r;
        stats[`p_${keys[i]}_${keys[j]}`] = c.p;
        nMin = Math.min(nMin, c.n);
        nMax = Math.max(nMax, c.n);
        if (c.p < 0.05) sigPairs.push(`„${vars[i].label}“ ir „${vars[j].label}“ (${sym} = ${fmt(c.r)})`);
      }
    }
    const descr = keys.map((k) => {
      const col = ds.rows.map((r) => r[k]).filter((v) => v !== null && v !== undefined && v !== "").map(Number).filter((v) => !Number.isNaN(v));
      return { m: mean(col), s: sd(col) };
    });
    // APA layout: number. label | M | SD | 1 | 2 | … (lower triangle, "—" on the diagonal).
    const rows = vars.map((v, i) => [
      `${i + 1}. ${v.label}`,
      fmt(descr[i].m),
      fmt(descr[i].s),
      ...vars.slice(0, -1).map((_, j) => (j < i ? `${fmt(cells[i][j].r)}${stars(cells[i][j].p)}` : j === i ? "—" : "")),
    ]);
    const nText = nMin === nMax ? `n = ${nMin}` : `n = ${nMin}–${nMax}`;
    return {
      stats,
      description:
        `Apskaičiuota ${keys.length} kintamųjų ${method === "spearman" ? "Spirmeno" : "Pirsono"} koreliacijų matrica (${nText}). ` +
        (sigPairs.length
          ? `Statistiškai reikšmingai (p < 0,05) susiję: ${sigPairs.join("; ")}.`
          : "Statistiškai reikšmingų ryšių (p < 0,05) nerasta."),
      tables: [
        {
          title: `${method === "spearman" ? "Spirmeno" : "Pirsono"} koreliacijos, vidurkiai ir standartiniai nuokrypiai`,
          columns: ["Kintamasis", "M", "SN", ...vars.slice(0, -1).map((_, j) => String(j + 1))],
          rows,
          note: `${nText}. * p < 0,05; ** p < 0,01; *** p < 0,001.`,
        },
      ],
    };
  },
};
