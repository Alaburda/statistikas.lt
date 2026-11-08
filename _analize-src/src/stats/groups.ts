// Three or more groups: post-hoc comparisons after ANOVA (Tukey HSD / Games–Howell)
// and the Kruskal–Wallis test with Dunn's post-hoc comparisons.
import type { AnalysisResult, ResultTable, TestDefinition } from "../types";
import { chiSquareUpperP, ptukey, qtukey, zTwoTailedP } from "./distributions";
import { fmt, fmtP, fmtPInline, significanceNote, stars } from "./format";
import { getVar, groupNumeric, mean, median, rankWithTies, variance } from "./helpers";

type Group = { label: string; values: number[] };

export interface PairComparison {
  a: string;
  b: string;
  diff: number;
  p: number;
  ciLo?: number;
  ciHi?: number;
  stat: number;
}

/** Holm step-down adjustment; returns adjusted p-values in input order. */
export function holm(ps: number[]): number[] {
  const order = ps.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  const out = new Array<number>(ps.length);
  let running = 0;
  order.forEach(({ p, i }, rank) => {
    running = Math.max(running, Math.min(1, (ps.length - rank) * p));
    out[i] = running;
  });
  return out;
}

/** Tukey HSD (Tukey–Kramer for unequal n), using the pooled within-group variance. */
export function tukeyHSD(groups: Group[]): PairComparison[] {
  const k = groups.length;
  const N = groups.reduce((s, g) => s + g.values.length, 0);
  const df = N - k;
  const mse = groups.reduce((s, g) => s + variance(g.values) * (g.values.length - 1), 0) / df;
  const qcrit = qtukey(0.95, k, df);
  const out: PairComparison[] = [];
  for (let i = 0; i < k; i++)
    for (let j = i + 1; j < k; j++) {
      const a = groups[i];
      const b = groups[j];
      const diff = mean(a.values) - mean(b.values);
      const se = Math.sqrt((mse / 2) * (1 / a.values.length + 1 / b.values.length));
      const q = Math.abs(diff) / se;
      out.push({ a: a.label, b: b.label, diff, stat: q, p: 1 - ptukey(q, k, df), ciLo: diff - qcrit * se, ciHi: diff + qcrit * se });
    }
  return out;
}

/** Games–Howell: per-pair Welch standard errors and df; no equal-variance assumption. */
export function gamesHowell(groups: Group[]): PairComparison[] {
  const k = groups.length;
  const out: PairComparison[] = [];
  for (let i = 0; i < k; i++)
    for (let j = i + 1; j < k; j++) {
      const a = groups[i].values;
      const b = groups[j].values;
      const va = variance(a) / a.length;
      const vb = variance(b) / b.length;
      const diff = mean(a) - mean(b);
      const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
      const se = Math.sqrt((va + vb) / 2);
      const q = Math.abs(diff) / se;
      const qcrit = qtukey(0.95, k, df);
      out.push({ a: groups[i].label, b: groups[j].label, diff, stat: q, p: 1 - ptukey(q, k, df), ciLo: diff - qcrit * se, ciHi: diff + qcrit * se });
    }
  return out;
}

export function postHocTable(title: string, comps: PairComparison[], note: string): ResultTable {
  return {
    title,
    columns: ["Palyginimas", "Vidurkių skirtumas", "95 % PI", "p"],
    rows: comps.map((c) => [
      `${c.a} – ${c.b}`,
      `${fmt(c.diff)}${stars(c.p)}`,
      c.ciLo !== undefined ? `[${fmt(c.ciLo)}; ${fmt(c.ciHi!)}]` : "",
      fmtP(c.p),
    ]),
    note,
  };
}

/** "„A“ ir „B“ (p = 0,012)" list of the significant pairs, or null. */
export function significantPairs(comps: PairComparison[]): string | null {
  const sig = comps.filter((c) => c.p < 0.05);
  if (sig.length === 0) return null;
  return sig.map((c) => `„${c.a}“ ir „${c.b}“ (p ${fmtPInline(c.p)})`).join("; ");
}

export const kruskal: TestDefinition = {
  id: "kruskal",
  name: "Kruskal–Wallis testas",
  blurb: "Neparametrinis kiekybinio ar ranginio kintamojo palyginimas tarp trijų ar daugiau grupių (ANOVA alternatyva).",
  methods:
    "Trijų ar daugiau nepriklausomų grupių pasiskirstymams palyginti, kai negalima daryti normalumo prielaidos, taikytas Kruskal–Wallis H testas; porinei grupių palyginimui taikytas Dunno testas su Holmo pataisa daugybiniams palyginimams.",
  apa: "Dunn, O. J. (1964). Multiple comparisons using rank sums. Technometrics, 6(3), 241–252. https://doi.org/10.1080/00401706.1964.10490181",
  guide: {
    title: "Kada rinktis Kruskal–Wallis testą?",
    url: "https://statistikas.lt/posts/kada-rinktis-kruskal-wallis/kada-rinktis-kruskal-wallis.html",
  },
  inputs: [
    { id: "outcome", label: "Kiekybinis ar ranginis kintamasis", accepts: "any" },
    { id: "group", label: "Grupavimo kintamasis", accepts: "categorical" },
  ],
  run: (ds, picks): AnalysisResult => {
    const outVar = getVar(ds, picks.outcome);
    const grpVar = getVar(ds, picks.group);
    const groups = groupNumeric(ds, picks.outcome, picks.group);
    if (groups.length < 2) throw new Error("Kruskal–Wallis testui reikia bent 2 grupių.");
    const all = groups.flatMap((g) => g.values);
    const N = all.length;
    const { ranks, tieTerm } = rankWithTies(all);
    let offset = 0;
    const meanRanks = groups.map((g) => {
      const r = ranks.slice(offset, offset + g.values.length);
      offset += g.values.length;
      return r.reduce((a, b) => a + b, 0) / r.length;
    });
    const k = groups.length;
    let H = 0;
    groups.forEach((g, i) => (H += g.values.length * meanRanks[i] ** 2));
    H = (12 / (N * (N + 1))) * H - 3 * (N + 1);
    H /= 1 - tieTerm / (N ** 3 - N);
    const df = k - 1;
    const p = chiSquareUpperP(H, df);
    const eps2 = H / (N - 1);

    // Dunn's z for each pair, tie-corrected; Holm-adjusted two-sided p.
    const pairs: { a: string; b: string; z: number; p: number }[] = [];
    const s2 = (N * (N + 1)) / 12 - tieTerm / (12 * (N - 1));
    for (let i = 0; i < k; i++)
      for (let j = i + 1; j < k; j++) {
        const z = (meanRanks[i] - meanRanks[j]) / Math.sqrt(s2 * (1 / groups[i].values.length + 1 / groups[j].values.length));
        pairs.push({ a: groups[i].label, b: groups[j].label, z, p: zTwoTailedP(z) });
      }
    const adj = holm(pairs.map((x) => x.p));
    const stats: Record<string, number> = { H, df, p, eps2 };
    pairs.forEach((x, i) => {
      stats[`dunnZ_${i}`] = x.z;
      stats[`dunnP_${i}`] = adj[i];
    });
    const sig = pairs.filter((_, i) => adj[i] < 0.05);
    const tables: ResultTable[] = [
      {
        title: "Grupių rangai",
        columns: ["Grupė", "N", "Mediana", "Vidutinis rangas"],
        rows: groups.map((g, i) => [g.label, g.values.length, fmt(median(g.values)), fmt(meanRanks[i])]),
      },
      {
        title: "Kruskal–Wallis testas",
        columns: ["H", "lls", "p", "ε²"],
        rows: [[fmt(H), df, fmtP(p), fmt(eps2)]],
      },
    ];
    if (k >= 3) {
      tables.push({
        title: "Porinis palyginimas (Dunno testas)",
        columns: ["Palyginimas", "z", "p (pataisyta)"],
        rows: pairs.map((x, i) => [`${x.a} – ${x.b}`, `${fmt(x.z)}${stars(adj[i])}`, fmtP(adj[i])]),
        note: "p reikšmės pataisytos Holmo metodu. * p < 0,05; ** p < 0,01; *** p < 0,001.",
      });
    }
    return {
      pValue: p,
      stats,
      assumptions: [
        groups.some((g) => g.values.length < 5)
          ? { label: "Imties dydis", status: "warn", detail: "Bent vienoje grupėje mažiau nei 5 stebėjimai – χ² aproksimacija gali būti netiksli." }
          : { label: "Nereikalaujama normalumo", status: "pass", detail: "Kruskal–Wallis testas lygina rangus ir nereikalauja normalumo prielaidos." },
      ],
      description:
        `Kruskal–Wallis testu palygintas kintamasis „${outVar.label}“ tarp ${k} grupavimo kintamojo „${grpVar.label}“ grupių (N = ${N}). ` +
        `Skirtumas yra ${significanceNote(p)}: H(${df}) = ${fmt(H)}; p ${fmtPInline(p)}; ε² = ${fmt(eps2)}.` +
        (k >= 3 && p < 0.05
          ? sig.length
            ? ` Dunno porinis palyginimas (Holmo pataisa) parodė reikšmingus skirtumus tarp: ${sig.map((x) => `„${x.a}“ ir „${x.b}“`).join("; ")}.`
            : " Porinis Dunno palyginimas reikšmingų skirtumų tarp atskirų grupių porų neparodė."
          : ""),
      tables,
      plot: {
        kind: "boxplot",
        title: `Kintamasis „${outVar.label}“ pagal „${grpVar.label}“`,
        yLabel: outVar.label,
        groups: groups.map((g) => ({ label: g.label, values: g.values })),
      },
    };
  },
};
