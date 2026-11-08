// Two related measurements (e.g. before/after): paired t-test and Wilcoxon signed-rank test.
import type { AnalysisResult, TestDefinition } from "../types";
import { normalityCheck } from "./assumptions";
import { tQuantile, tTwoTailedP, zTwoTailedP } from "./distributions";
import { fmt, fmtP, fmtPInline, significanceNote } from "./format";
import { getVar, mean, median, pairedNumeric, rankWithTies, sd } from "./helpers";

const PAIR_INPUTS = (accepts: "numeric" | "any") => [
  { id: "first", label: "Pirmasis matavimas (pvz., prieš)", accepts },
  { id: "second", label: "Antrasis matavimas (pvz., po)", accepts },
];

function pairedData(ds: Parameters<TestDefinition["run"]>[0], picks: Record<string, string>) {
  if (picks.first === picks.second) throw new Error("Pasirinkite du skirtingus matavimus.");
  const a = getVar(ds, picks.first);
  const b = getVar(ds, picks.second);
  const { x, y } = pairedNumeric(ds, picks.first, picks.second);
  if (x.length < 3) throw new Error(`Per mažai respondentų su abiem matavimais (n = ${x.length}).`);
  return { a, b, x, y, diff: x.map((xi, i) => y[i] - xi) };
}

export const pairedT: TestDefinition = {
  id: "paired_ttest",
  name: "Priklausomų imčių t testas",
  blurb: "Palygina du tų pačių respondentų matavimus (pvz., prieš ir po) – ar vidutinis pokytis skiriasi nuo nulio.",
  methods:
    "Dviem tų pačių tiriamųjų matavimams palyginti taikytas priklausomų imčių t testas; efekto dydžiui įvertinti apskaičiuotas Coheno d_z.",
  guide: {
    title: "Priklausomų imčių t testas",
    url: "https://statistikas.lt/posts/priklausomu-imciu-t-testas/priklausomu-imciu-t-testas.html",
  },
  inputs: PAIR_INPUTS("numeric"),
  run: (ds, picks): AnalysisResult => {
    const { a, b, x, y, diff } = pairedData(ds, picks);
    const n = diff.length;
    const md = mean(diff);
    const sdd = sd(diff);
    const se = sdd / Math.sqrt(n);
    const df = n - 1;
    const t = md / se;
    const p = tTwoTailedP(t, df);
    const tcrit = tQuantile(0.975, df);
    const ciLo = md - tcrit * se;
    const ciHi = md + tcrit * se;
    const dz = md / sdd;
    return {
      pValue: p,
      stats: { t, df, p, meanDiff: md, ciLo, ciHi, dz, n },
      assumptions: [
        normalityCheck("Skirtumų normalumas", diff, {
          testId: "wilcoxon",
          picks: { first: picks.first, second: picks.second },
          label: "Pereiti prie Wilcoxono testo",
        }),
      ],
      description:
        `Priklausomų imčių t testu palyginti matavimai „${a.label}“ (vidurkis ${fmt(mean(x))}; SN = ${fmt(sd(x))}) ir ` +
        `„${b.label}“ (vidurkis ${fmt(mean(y))}; SN = ${fmt(sd(y))}); n = ${n}. ` +
        `Vidutinis pokytis ${fmt(md)} (95 % PI [${fmt(ciLo)}; ${fmt(ciHi)}]) yra ${significanceNote(p)}: ` +
        `t(${df}) = ${fmt(t)}; p ${fmtPInline(p)}; Coheno d_z = ${fmt(dz)}.`,
      tables: [
        {
          title: "Matavimų statistika",
          columns: ["Matavimas", "N", "Vidurkis", "Standartinis nuokrypis (SN)"],
          rows: [
            [a.label, n, fmt(mean(x)), fmt(sd(x))],
            [b.label, n, fmt(mean(y)), fmt(sd(y))],
          ],
        },
        {
          title: "Priklausomų imčių t testas",
          columns: ["Vidutinis pokytis", "SN", "95 % PI", "t", "lls", "p", "Coheno d_z"],
          rows: [[fmt(md), fmt(sdd), `[${fmt(ciLo)}; ${fmt(ciHi)}]`, fmt(t), df, fmtP(p), fmt(dz)]],
          note: `Pokytis = „${b.label}“ − „${a.label}“.`,
        },
      ],
      plot: {
        kind: "boxplot",
        title: "Matavimų palyginimas",
        yLabel: "Reikšmė",
        groups: [
          { label: a.label, values: x },
          { label: b.label, values: y },
        ],
      },
    };
  },
};

export const wilcoxon: TestDefinition = {
  id: "wilcoxon",
  name: "Wilcoxono ženklų rangų testas",
  blurb: "Neparametrinis dviejų tų pačių respondentų matavimų palyginimas (pvz., Likerto atsakymai prieš ir po).",
  methods:
    "Dviem tų pačių tiriamųjų matavimams palyginti, kai negalima daryti normalumo prielaidos, taikytas Wilcoxono ženklų rangų testas (normalioji aproksimacija su pataisa susietiesiems rangams); efekto dydis įvertintas r = |z|/√n.",
  guide: {
    title: "Wilcoxono ženklų rangų testas",
    url: "https://statistikas.lt/posts/wilcoxono-zenklu-rangu-testas/wilcoxono-zenklu-rangu-testas.html",
  },
  inputs: PAIR_INPUTS("any"),
  run: (ds, picks): AnalysisResult => {
    const { a, b, x, y, diff } = pairedData(ds, picks);
    // Zero differences are dropped (Wilcoxon's method, as SPSS and R).
    const nz = diff.filter((d) => d !== 0);
    const nTies = diff.length - nz.length;
    const n = nz.length;
    if (n < 2) throw new Error("Beveik visi skirtumai lygūs nuliui – testo atlikti negalima.");
    const { ranks, tieTerm } = rankWithTies(nz.map(Math.abs));
    let wPlus = 0;
    let nPos = 0;
    nz.forEach((d, i) => {
      if (d > 0) {
        wPlus += ranks[i];
        nPos++;
      }
    });
    const wMinus = (n * (n + 1)) / 2 - wPlus;
    const mu = (n * (n + 1)) / 4;
    const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tieTerm / 48);
    const z = (wPlus - mu) / sigma;
    const p = zTwoTailedP(z);
    const r = Math.abs(z) / Math.sqrt(n);
    return {
      pValue: p,
      stats: { V: wPlus, z, p, r, n },
      assumptions: [
        n < 10
          ? {
              label: "Imties dydis",
              status: "warn",
              detail: `Tik ${n} nenuliniai skirtumai – normalioji aproksimacija gali būti netiksli.`,
            }
          : {
              label: "Nereikalaujama normalumo",
              status: "pass",
              detail: "Wilcoxono testas lygina skirtumų rangus ir nereikalauja normalumo prielaidos.",
            },
      ],
      description:
        `Wilcoxono ženklų rangų testu palyginti matavimai „${a.label}“ (mediana ${fmt(median(x))}) ir ` +
        `„${b.label}“ (mediana ${fmt(median(y))}). Iš ${diff.length} porų ${nPos} padidėjo, ${n - nPos} sumažėjo, ` +
        `${nTies} nepakito. Skirtumas yra ${significanceNote(p)}: z = ${fmt(z)}; p ${fmtPInline(p)}; r = ${fmt(r)}.`,
      tables: [
        {
          title: "Rangai",
          columns: ["", "N", "Rangų suma"],
          rows: [
            ["Teigiami skirtumai (padidėjo)", nPos, fmt(wPlus)],
            ["Neigiami skirtumai (sumažėjo)", n - nPos, fmt(wMinus)],
            ["Lygūs (nepakito)", nTies, ""],
          ],
          note: `Skirtumas = „${b.label}“ − „${a.label}“.`,
        },
        {
          title: "Testo statistikos",
          columns: ["W+", "z", "p", "r"],
          rows: [[fmt(wPlus), fmt(z), fmtP(p), fmt(r)]],
        },
      ],
      plot: {
        kind: "boxplot",
        title: "Matavimų palyginimas",
        yLabel: "Reikšmė",
        groups: [
          { label: a.label, values: x },
          { label: b.label, values: y },
        ],
      },
    };
  },
};
