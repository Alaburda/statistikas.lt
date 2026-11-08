import { useMemo } from "react";
import {
  RANK_ARE,
  cohenF,
  cohenW,
  effectOf,
  effectPossible,
  mcnemarValid,
  minN,
  twoWayF,
  type RmEffect,
  p1FromOdds,
  pooledSd,
  power,
  propsAt,
  sdFromCi,
  sdFromIqr,
  sdUpper,
  sizes,
  solveEffect,
  solveN,
  withDropout,
  withEffect,
  type Spec,
  type Test,
} from "../engine/compare";
import { qchisq } from "../engine/dist";
import { fmtInput, fmtInt, fmtNum, fmtPct, fmtShort, parseNum } from "../format";
import { L, PCT, plural } from "../i18n";
import { DESIGN_ICONS } from "./DesignIcons";
import { compareReport } from "../report";
import { useForm } from "../url";
import { Check, More, NumField, Notice, Peek, Segmented, TextField } from "./Fields";
import { PowerCurve, type CurveSeries } from "./PowerCurve";
import { ReportBlock, StatementBox } from "./ReportBlock";

const DEFAULTS = {
  design: "means",
  solve: "n",
  delta: "5",
  sd: "10",
  find: "",
  pre: "",
  r: "0.5",
  p1: "30",
  p2: "45",
  entry: "two",
  or: "2",
  base: "4",
  lift: "20",
  daily: "1500",
  means: "10; 12; 15",
  corr: "0.3",
  n: "40",
  alpha: "0.05",
  power: "80",
  sides: "2",
  ratio: "1",
  drop: "15",
  m: "1",
  rank: "0",
  h1: "",
  h2: "",
  h3: "",
  h4: "",
  // ANCOVA: covariates and how strongly they predict the outcome.
  cov: "0",
  covR: "0.5",
  // Factorial and repeated measures: a table of means, or Cohen's f with the layout.
  eff: "means",
  fac: "10; 12; 14\n11; 14; 18",
  facEff: "A",
  rmt: "10; 11,5; 12,5",
  rmEff: "within",
  rho: "0.5",
  eps: "1",
  fval: "0.25",
  levA: "2",
  levB: "3",
  // Regression.
  regTest: "all",
  preds: "4",
  tested: "1",
  r2: "15",
  r2Base: "20",
  r2Gain: "5",
  // Logistic regression.
  lx: "binary",
  lp0: "20",
  lor: "2",
  lshare: "50",
  lr2: "0",
  // Chi-square.
  ctab: "30; 50; 20\n20; 50; 30",
  // McNemar.
  mp1: "40",
  mp2: "25",
  mdisc: "",
};

type Design = "means" | "paired" | "props" | "ab" | "anova" | "factorial" | "rm" | "corr" | "reg" | "logit" | "chisq" | "mcnemar";
type Form = typeof DEFAULTS;

type Unit = { lt: [string, string, string]; en: [string, string] };
const SUBJECTS: Unit = { lt: ["tiriamasis", "tiriamieji", "tiriamųjų"], en: ["participant", "participants"] };
const VISITORS: Unit = { lt: ["lankytojas", "lankytojai", "lankytojų"], en: ["visitor", "visitors"] };
const PAIRS: Unit = { lt: ["pora matavimų", "poros matavimų", "porų matavimų"], en: ["pair of measurements", "pairs of measurements"] };
/** "With n …" needs the Lithuanian instrumental. */
const SUBJECTS_WITH: Unit = { lt: ["tiriamuoju", "tiriamaisiais", "tiriamųjų"], en: SUBJECTS.en };
const VISITORS_WITH: Unit = { lt: ["lankytoju", "lankytojais", "lankytojų"], en: VISITORS.en };
const PAIRS_WITH: Unit = { lt: ["pora matavimų", "poromis matavimų", "porų matavimų"], en: PAIRS.en };
const word = (n: number, u: Unit) => plural(n, u.lt, u.en);

/** What each design is, shown under the picker. */
const DESIGN_NOTES: Record<Design, string> = L(
  {
    means: "Dvi atskiros grupės (pvz., gydymas ir kontrolė), kiekvienas tiriamasis matuojamas kartą; lyginami vidurkiai.",
    paired: "Tie patys žmonės matuojami du kartus (prieš ir po) arba sudarytos poros; vertinamas pokytis.",
    props: "Dvi grupės, rezultatas taip / ne (pvz., pasveiko ar ne); lyginamos dalys. Tinka ir atvejo–kontrolės tyrimui.",
    ab: "Dvi svetainės ar laiško versijos, lankytojai paskirstomi atsitiktinai; lyginama konversija.",
    anova: "Trys ar daugiau atskirų grupių; lyginami vidurkiai (vienfaktorė ANOVA). Su kovariantėmis – ANCOVA.",
    factorial: "Du veiksniai kartu, pvz., gydymas × lytis; tikrinamas vieno veiksnio arba jų sąveikos efektas (dvifaktorė ANOVA).",
    rm: "Tie patys žmonės matuojami 3 ar daugiau kartų; gali būti ir kelios grupės (mišri ANOVA: grupė × laikas).",
    corr: "Viena grupė, du kiekybiniai matavimai kiekvienam; ar jie susiję (Pirsono r).",
    reg: "Ar keli kintamieji kartu paaiškina rezultatą, arba ar nauji kintamieji prideda prie jau turimų (tiesinė regresija).",
    logit: "Rezultatas taip / ne (pvz., susirgo ar ne); ar jį lemia veiksnys, atsižvelgiant į kitus (logistinė regresija).",
    chisq: "Grupės ir atsakymas su 2 ar daugiau kategorijų (pvz., pasirinktas planas); ar pasiskirstymas skiriasi (χ² testas).",
    mcnemar: "Tie patys žmonės atsako taip / ne du kartus (prieš ir po); ar „taip“ dalis pasikeitė (McNemar testas).",
  },
  {
    means: "Two separate groups (e.g. treatment and control), each person measured once; the means are compared.",
    paired: "The same people measured twice (before and after), or matched pairs; the change is assessed.",
    props: "Two groups with a yes/no outcome (e.g. recovered or not); the proportions are compared. Also for case–control studies.",
    ab: "Two versions of a page or an email, visitors split at random; the conversion rates are compared.",
    anova: "Three or more separate groups; the means are compared (one-way ANOVA). With covariates, ANCOVA.",
    factorial: "Two factors at once, e.g. treatment × sex; the effect of one factor or their interaction is tested (two-way ANOVA).",
    rm: "The same people measured three or more times, possibly in several groups (mixed ANOVA: group × time).",
    corr: "One group, two numeric measurements per person; are they related (Pearson's r)?",
    reg: "Do several variables together explain an outcome, or do new variables add to those already in the model (linear regression)?",
    logit: "A yes/no outcome (e.g. fell ill or not); does a factor predict it, allowing for others (logistic regression)?",
    chisq: "Groups and an answer with two or more categories (e.g. the plan chosen); does the distribution differ (χ² test)?",
    mcnemar: "The same people answer yes/no twice (before and after); did the share saying yes change (McNemar's test)?",
  },
);

/** Rows on lines (or split by "/"), values by semicolons or spaces; null unless rectangular. */
function parseTable(text: string): number[][] | null {
  const rows = text
    .split(/\r?\n|\//)
    .map((line) => line.split(/[;\s]+/).filter(Boolean).map(parseNum))
    .filter((row) => row.length > 0);
  if (rows.length === 0 || rows.some((row) => row.length !== rows[0].length || row.some((x) => !Number.isFinite(x)))) return null;
  return rows;
}

const int = (s: string) => {
  const v = parseNum(s);
  return Number.isInteger(v) ? v : NaN;
};

/** Cohen's f adjusted for covariates that explain r² of the outcome's variance (Borm et al. 2007). */
function covariates(f: Form): { count: number; r: number } | null {
  const count = int(f.cov);
  if (!(count >= 0)) return null;
  if (count === 0) return { count: 0, r: 0 };
  const r = parseNum(f.covR);
  return r >= 0 && r < 1 ? { count, r } : null;
}

function buildSpec(f: Form): Spec | null {
  const design = f.design as Design;
  const ratio = parseNum(f.ratio);
  const twoGroup = ratio > 0 ? ratio : NaN;
  switch (design) {
    case "means": {
      const delta = parseNum(f.delta);
      const sd = parseNum(f.sd);
      return delta > 0 && sd > 0 && twoGroup ? { kind: "means", delta, sd, ratio } : null;
    }
    case "paired": {
      const delta = parseNum(f.delta);
      const direct = parseNum(f.sd);
      const pre = parseNum(f.pre);
      const r = parseNum(f.r);
      const sdDiff = pre > 0 && r > -1 && r < 1 ? pre * Math.sqrt(2 * (1 - r)) : direct;
      return delta > 0 && sdDiff > 0 ? { kind: "paired", delta, sdDiff } : null;
    }
    case "props": {
      // With an odds ratio the input is the controls' share, and controls are group 2,
      // so that the ratio reads as controls per case.
      const first = parseNum(f.p1) / 100;
      const p1 = f.entry === "or" ? p1FromOdds(first, parseNum(f.or)) : first;
      const p2 = f.entry === "or" ? first : parseNum(f.p2) / 100;
      return p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1 && p1 !== p2 && twoGroup
        ? { kind: "props", p1, p2, ratio, fixed: f.entry === "or" ? "p2" : "p1" }
        : null;
    }
    case "ab": {
      const p1 = parseNum(f.base) / 100;
      const p2 = p1 * (1 + parseNum(f.lift) / 100);
      return p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1 && p1 !== p2 ? { kind: "props", p1, p2, ratio: 1 } : null;
    }
    case "anova": {
      const means = f.means.split(/[;\s]+/).filter(Boolean).map(parseNum);
      const sd = parseNum(f.sd);
      const cov = covariates(f);
      if (means.length < 2 || means.some(Number.isNaN) || !(sd > 0) || !cov) return null;
      const effect = cohenF(means, sd) / Math.sqrt(1 - cov.r * cov.r);
      if (!(effect > 0)) return null;
      return cov.count > 0 ? { kind: "anova", groups: means.length, f: effect, covariates: cov.count } : { kind: "anova", groups: means.length, f: effect };
    }
    case "factorial": {
      const cov = covariates(f);
      const effect = f.facEff as "A" | "B" | "AB";
      let a: number, b: number, fx: number;
      if (f.eff === "f") {
        [a, b, fx] = [int(f.levA), int(f.levB), parseNum(f.fval)];
      } else {
        const table = parseTable(f.fac);
        const sd = parseNum(f.sd);
        if (!table || !(sd > 0)) return null;
        [a, b] = [table.length, table[0].length];
        const fs = twoWayF(table, sd);
        fx = effect === "A" ? fs.rows : effect === "B" ? fs.cols : fs.inter;
      }
      if (!cov || !(a >= 2 && b >= 2) || !(fx > 0)) return null;
      return { kind: "factorial", a, b, effect, f: fx / Math.sqrt(1 - cov.r * cov.r), covariates: cov.count };
    }
    case "rm": {
      let groups: number, times: number, fx: number;
      const rho = parseNum(f.rho);
      const eps = parseNum(f.eps);
      if (f.eff === "f") {
        [groups, times, fx] = [int(f.levA), int(f.levB), parseNum(f.fval)];
      } else {
        const table = parseTable(f.rmt);
        const sd = parseNum(f.sd);
        if (!table || !(sd > 0)) return null;
        [groups, times] = [table.length, table[0].length];
        const fs = twoWayF(table, sd);
        fx = f.rmEff === "between" ? fs.rows : f.rmEff === "inter" ? fs.inter : fs.cols;
      }
      const effect: RmEffect = groups === 1 ? "within" : (f.rmEff as RmEffect);
      if (!(groups >= 1 && times >= 2) || !(fx > 0) || !(rho > -1 / (times - 1) && rho < 1)) return null;
      if (!(eps >= 1 / (times - 1) - 1e-9 && eps <= 1)) return null;
      return { kind: "rm", groups, times, effect, f: fx, rho, eps };
    }
    case "corr": {
      const r = parseNum(f.corr);
      return r !== 0 && Math.abs(r) < 1 ? { kind: "corr", r } : null;
    }
    case "reg": {
      const predictors = int(f.preds);
      if (!(predictors >= 1)) return null;
      if (f.regTest === "all") {
        const r2 = parseNum(f.r2) / 100;
        return r2 > 0 && r2 < 1 ? { kind: "reg", predictors, tested: predictors, r2Base: 0, r2Gain: r2 } : null;
      }
      const tested = int(f.tested);
      const base = parseNum(f.r2Base) / 100;
      const gain = parseNum(f.r2Gain) / 100;
      return tested >= 1 && tested <= predictors && base >= 0 && gain > 0 && base + gain < 1
        ? { kind: "reg", predictors, tested, r2Base: base, r2Gain: gain }
        : null;
    }
    case "logit": {
      const p0 = parseNum(f.lp0) / 100;
      const or = parseNum(f.lor);
      const share = f.lx === "binary" ? parseNum(f.lshare) / 100 : 0.5;
      const r2 = (parseNum(f.lr2) || 0) / 100;
      return p0 > 0 && p0 < 1 && or > 0 && or !== 1 && share > 0 && share < 1 && r2 >= 0 && r2 < 1
        ? { kind: "logit", x: f.lx === "normal" ? "normal" : "binary", p0, or, share, r2 }
        : null;
    }
    case "chisq": {
      if (f.eff === "f") {
        const [rows, cols, w] = [int(f.levA), int(f.levB), parseNum(f.fval)];
        return rows >= 2 && cols >= 2 && w > 0 ? { kind: "chisq", rows, cols, w } : null;
      }
      const table = parseTable(f.ctab);
      if (!table || table.length < 2 || table[0].length < 2 || table.flat().some((x) => !(x > 0))) return null;
      const w = cohenW(table);
      return w > 0 ? { kind: "chisq", rows: table.length, cols: table[0].length, w } : null;
    }
    case "mcnemar": {
      const p1 = parseNum(f.mp1) / 100;
      const p2 = parseNum(f.mp2) / 100;
      const disc = f.mdisc.trim() === "" ? p1 * (1 - p2) + p2 * (1 - p1) : parseNum(f.mdisc) / 100;
      const spec: Spec = { kind: "mcnemar", p1, p2, disc };
      return p1 > 0 && p1 < 1 && disc > 0 && mcnemarValid(spec) ? spec : null;
    }
  }
}

function effectText(spec: Spec, e: number): string {
  switch (spec.kind) {
    case "means":
      return `${fmtShort(e, 3)} ${L("vnt.", "units")} (d = ${fmtNum(e / spec.sd)})`;
    case "paired":
      return `${fmtShort(e, 3)} ${L("vnt.", "units")} (dz = ${fmtNum(e / spec.sdDiff)})`;
    case "props": {
      const at = propsAt(spec, e);
      return spec.fixed === "p2"
        ? L(`${fmtPct(at.p1, 2)} prieš ${fmtPct(at.p2, 2)} kontrolėje`, `${fmtPct(at.p1, 2)} vs ${fmtPct(at.p2, 2)} in controls`)
        : L(`nuo ${fmtPct(at.p1, 2)} iki ${fmtPct(at.p2, 2)}`, `from ${fmtPct(at.p1, 2)} to ${fmtPct(at.p2, 2)}`);
    }
    case "anova":
    case "factorial":
    case "rm":
      return `f = ${fmtNum(e, 3)}`;
    case "corr":
      return `r = ${fmtNum(e, 3)}`;
    case "reg": {
      const f2 = e / (1 - spec.r2Base - e);
      return spec.r2Base > 0 || spec.tested < spec.predictors ? `ΔR² = ${fmtPct(e, 1)} (f² = ${fmtNum(f2, 3)})` : `R² = ${fmtPct(e, 1)} (f² = ${fmtNum(f2, 3)})`;
    }
    case "logit":
      return `OR = ${fmtNum(Math.exp(spec.or >= 1 ? e : -e), 2)}`;
    case "chisq":
      return `w = ${fmtNum(e, 3)}`;
    case "mcnemar": {
      const p2 = spec.p2 <= spec.p1 ? spec.p1 - e : spec.p1 + e;
      return L(`nuo ${fmtPct(spec.p1, 1)} iki ${fmtPct(p2, 1)}`, `from ${fmtPct(spec.p1, 1)} to ${fmtPct(p2, 1)}`);
    }
  }
}

/** Where the per-group label applies: n is per group (or cell) rather than in total. */
function perGroup(spec: Spec | null, design: Design): boolean {
  if (design === "anova" || design === "factorial") return true;
  if (design === "rm") return !spec || spec.kind !== "rm" || spec.groups > 1;
  return design === "means" || design === "props" || design === "ab";
}

/** Finds an SD from what a paper actually reports, or a safer value from a pilot. */
function SdFinder({ form, set }: { form: Form; set: (p: Partial<Form>) => void }) {
  const [a, b, c, d] = [parseNum(form.h1), parseNum(form.h2), parseNum(form.h3), parseNum(form.h4)];
  const fromTwo = a > 0 && b >= 2 && c > 0 && d >= 2 ? pooledSd(a, b, c, d) : NaN;
  const ciN = c >= 2 ? c : NaN;
  const fromCi = b > a && ciN ? sdFromCi(a, b, ciN, 0.95) : NaN;
  const fromIqr = b > a ? sdFromIqr(a, b) : NaN;
  const pilot = a > 0 && b >= 3 ? sdUpper(a, b - 1, 0.8, qchisq) : NaN;
  const kind = form.find;
  const use = (v: number) => set({ sd: fmtInput(v, 2) });
  const pick = (find: string) => set({ find, h1: "", h2: "", h3: "", h4: "" });
  return (
    <More title={L("Neturite standartinio nuokrypio?", "No standard deviation?")}>
      <p className="hint">{L("Straipsnyje dažnai būna ne SD, o kas nors kita. Pasirinkite, ką turite:", "Papers often report something other than the SD. Pick what you have:")}</p>
      <div className="chips">
        <button type="button" className={kind === "ci" ? "on" : ""} onClick={() => pick("ci")}>
          95{PCT} {L("PI", "CI")}
        </button>
        <button type="button" className={kind === "iqr" ? "on" : ""} onClick={() => pick("iqr")}>
          {L("Kvartiliai", "Quartiles")}
        </button>
        <button type="button" className={kind === "two" ? "on" : ""} onClick={() => pick("two")}>
          {L("Dviejų grupių SD", "SDs of two groups")}
        </button>
        <button type="button" className={kind === "pilot" ? "on" : ""} onClick={() => pick("pilot")}>
          {L("Pilotinis tyrimas", "A pilot study")}
        </button>
      </div>
      {kind === "ci" && (
        <>
          <NumField label={L("PI apatinė riba", "Lower CI limit")} value={form.h1} onChange={(h1) => set({ h1 })} />
          <NumField label={L("PI viršutinė riba", "Upper CI limit")} value={form.h2} onChange={(h2) => set({ h2 })} />
          <NumField label={L("Tiriamųjų toje grupėje", "Participants in that group")} value={form.h3} onChange={(h3) => set({ h3 })} decimal={false} />
          {Number.isFinite(fromCi) && <SdResult value={fromCi} use={use} />}
        </>
      )}
      {kind === "iqr" && (
        <>
          <NumField label={L("1 kvartilis (Q1)", "First quartile (Q1)")} value={form.h1} onChange={(h1) => set({ h1 })} />
          <NumField label={L("3 kvartilis (Q3)", "Third quartile (Q3)")} value={form.h2} onChange={(h2) => set({ h2 })} />
          {Number.isFinite(fromIqr) && (
            <SdResult value={fromIqr} use={use} note={L("Tinka apytiksliai simetriškiems duomenims.", "For roughly symmetric data.")} />
          )}
        </>
      )}
      {kind === "two" && (
        <>
          <NumField label={L("1 grupės SD", "Group 1 SD")} value={form.h1} onChange={(h1) => set({ h1 })} />
          <NumField label={L("1 grupės n", "Group 1 n")} value={form.h2} onChange={(h2) => set({ h2 })} decimal={false} />
          <NumField label={L("2 grupės SD", "Group 2 SD")} value={form.h3} onChange={(h3) => set({ h3 })} />
          <NumField label={L("2 grupės n", "Group 2 n")} value={form.h4} onChange={(h4) => set({ h4 })} decimal={false} />
          {Number.isFinite(fromTwo) && <SdResult value={fromTwo} use={use} />}
        </>
      )}
      {kind === "pilot" && (
        <>
          <NumField label={L("Piloto SD", "Pilot SD")} value={form.h1} onChange={(h1) => set({ h1 })} />
          <NumField label={L("Piloto n", "Pilot n")} value={form.h2} onChange={(h2) => set({ h2 })} decimal={false} />
          {Number.isFinite(pilot) && (
            <SdResult
              value={pilot}
              use={use}
              note={L(
                "Viršutinė 80 % riba: mažo piloto SD dažnai būna per optimistiškas (Browne, 1995).",
                "The upper 80% limit: the SD of a small pilot is often too optimistic (Browne, 1995).",
              )}
            />
          )}
        </>
      )}
    </More>
  );
}

function SdResult({ value, use, note }: { value: number; use: (v: number) => void; note?: string }) {
  return (
    <p className="sd-result">
      SD ≈ <b>{fmtShort(value, 2)}</b>{" "}
      <button type="button" onClick={() => use(value)}>
        {L("Naudoti", "Use")}
      </button>
      {note && <span className="hint"> {note}</span>}
    </p>
  );
}

export function CompareTab({ active }: { active: boolean }) {
  const [form, set] = useForm("grupes", active, DEFAULTS);
  const design = form.design as Design;
  const isAb = design === "ab";
  const solve = form.solve as "n" | "power" | "effect";
  const unit = isAb ? VISITORS : design === "paired" ? PAIRS : SUBJECTS;
  const unitWith = isAb ? VISITORS_WITH : design === "paired" ? PAIRS_WITH : SUBJECTS_WITH;

  const spec = useMemo(() => buildSpec(form), [form]);
  const alphaPlain = parseNum(form.alpha);
  const comparisons = Math.max(1, Math.round(parseNum(form.m)) || 1);
  const test: Test = { alpha: alphaPlain / comparisons, sides: form.sides === "1" ? 1 : 2 };
  const target = parseNum(form.power) / 100;
  // Visitors don't drop out of an A/B test, and the field is hidden there.
  const dropout = design === "ab" ? 0 : (parseNum(form.drop) || 0) / 100;
  const rank = form.rank === "1" && (design === "means" || design === "paired" || design === "anova");
  const hasRatio = design === "means" || design === "props";
  const inputN = parseNum(form.n);
  const usable = spec && alphaPlain > 0 && alphaPlain < 1 && target > 0 && target < 1 && dropout >= 0 && dropout < 1;

  /** Base n after a rank-test inflation, as the result and the tables report it. */
  const adjust = (n: number) => (rank ? Math.ceil(n / RANK_ARE - 1e-9) : n);

  const calc = useMemo(() => {
    if (!usable || !spec) return null;
    const need = solve === "n" ? solveN(spec, test, target) : null;
    const baseN = solve === "n" ? need : inputN;
    if (baseN === null || !(baseN >= 2)) return { need, baseN: null, groups: null, enrolled: null, achieved: NaN, effect: null };
    const achieved = power(spec, test, baseN);
    const adjusted = solve === "n" ? adjust(baseN) : baseN;
    const groups = sizes(spec, adjusted);
    const enrolled = groups.map((g) => withDropout(g, solve === "n" ? dropout : 0));
    const effect = solve === "effect" ? solveEffect(spec, test, baseN, target) : null;
    return { need, baseN, groups, enrolled, achieved, effect };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, usable, solve, target, test.alpha, test.sides, inputN, dropout, rank]);

  const total = calc?.groups?.reduce((a, b) => a + b, 0) ?? 0;
  const enrolledTotal = calc?.enrolled?.reduce((a, b) => a + b, 0) ?? 0;
  const planned = calc?.baseN ?? null;
  const ownEffect = spec ? effectOf(spec) : 0;

  const scenarios = useMemo(() => {
    if (!usable || !spec || planned === null) return [];
    const factors = spec.kind === "corr" || spec.kind === "props" || spec.kind === "mcnemar" ? [0.7, 0.85, 1, 1.15] : [0.6, 0.8, 1, 1.25, 1.5];
    return factors.flatMap((k) => {
      const s = withEffect(spec, ownEffect * k);
      if (!effectPossible(spec, ownEffect * k)) return [];
      const n = solveN(s, test, target);
      return [{ k, label: effectText(spec, ownEffect * k), n: n === null ? null : sizes(s, n).reduce((a, b) => a + b, 0), power: power(s, test, planned) }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, usable, planned, target, test.alpha, test.sides, ownEffect]);

  const curve = useMemo(() => {
    if (!usable || !spec || planned === null) return null;
    const lines: { k: number; label: string; color: string; dash?: string }[] = [
      { k: 1, label: L("Planuojamas efektas", "Planned effect"), color: "#1F45A0" },
      { k: 0.8, label: L("20 % mažesnis", "20% smaller"), color: "#C23B2A", dash: "7 5" },
      { k: 1.2, label: L("20 % didesnis", "20% larger"), color: "#6B675F", dash: "2 4" },
    ];
    const lo = spec.kind === "corr" ? 5 : Math.max(3, minN(spec));
    const maxN = Math.max(Math.ceil(planned * 2), lo + 6);
    const count = 80;
    const xs = Array.from(new Set(Array.from({ length: count }, (_, i) => Math.round(lo + ((maxN - lo) * i) / (count - 1)))));
    const series: CurveSeries[] = lines
      .filter((l) => effectPossible(spec, ownEffect * l.k))
      .map((l) => {
        const s = withEffect(spec, ownEffect * l.k);
        return { label: l.label, color: l.color, dash: l.dash, values: xs.map((x) => power(s, test, x)) };
      });
    return { xs, series };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, usable, planned, test.alpha, test.sides, ownEffect]);

  const fall = scenarios.find((s) => s.k === 0.8 || s.k === 0.85);
  const days = isAb && calc?.groups ? Math.ceil(total / parseNum(form.daily)) : null;
  const smallForProps = spec?.kind === "props" && planned !== null && planned * Math.min(spec.p1, spec.p2) < 5;
  const chisqTable = design === "chisq" && form.eff !== "f" ? parseTable(form.ctab) : null;
  const smallForChisq =
    spec?.kind === "chisq" && chisqTable && planned !== null
      ? (planned / chisqTable.length) * Math.min(...chisqTable.map((row) => Math.min(...row) / row.reduce((a, b) => a + b, 0))) < 5
      : false;
  const facTable = design === "factorial" && form.eff !== "f" ? parseTable(form.fac) : null;
  const rmTable = design === "rm" && form.eff !== "f" ? parseTable(form.rmt) : null;
  const sdValue = parseNum(form.sd);
  const tableF = (t: number[][] | null) => (t && sdValue > 0 ? twoWayF(t, sdValue) : null);
  const facF = tableF(facTable);
  const rmF = tableF(rmTable);
  const rmGroups = spec?.kind === "rm" ? spec.groups : rmTable ? rmTable.length : int(form.levA);
  const ancovaR = (design === "anova" || design === "factorial") && int(form.cov) > 0 ? parseNum(form.covR) : null;
  const isPerGroup = perGroup(spec, design);
  const fHint = L("Mažas 0,10, vidutinis 0,25, didelis 0,40 (Cohen, 1988).", "Small 0.10, medium 0.25, large 0.40 (Cohen, 1988).");

  const report =
    solve === "n" && spec && calc?.groups && calc.enrolled && calc.baseN
      ? compareReport({
          spec,
          test,
          alphaPlain,
          comparisons,
          target,
          groups: calc.groups,
          achieved: calc.achieved,
          rank,
          dropout,
          enrolled: calc.enrolled,
          abTest: isAb,
          or: design === "props" && form.entry === "or" ? parseNum(form.or) : null,
          ancovaR,
          table: facTable && sdValue > 0 ? { means: facTable, sd: sdValue } : rmTable && sdValue > 0 ? { means: rmTable, sd: sdValue } : chisqTable ? { means: chisqTable, sd: null } : null,
        })
      : null;

  return (
    <>
      <div className="calc">
        <form className="inputs" onSubmit={(e) => e.preventDefault()}>
          <Segmented
            label={L("Ką lyginate?", "What are you comparing?")}
            value={design}
            onChange={(d) => set({ design: d, ratio: "1", eff: "means", fval: d === "chisq" ? "0.3" : "0.25", levA: d === "rm" ? "1" : "2", levB: "3" })}
            hint={<span className="design-note">{DESIGN_NOTES[design]}</span>}
            options={[
              { value: "means", label: L("Dvi grupės, vidurkiai", "Two groups, means"), icon: DESIGN_ICONS.means, group: L("Skirtingos grupės", "Separate groups") },
              { value: "props", label: L("Dvi grupės, dalys", "Two groups, proportions"), icon: DESIGN_ICONS.props, group: L("Skirtingos grupės", "Separate groups") },
              { value: "ab", label: L("A/B testas", "A/B test"), icon: DESIGN_ICONS.ab, group: L("Skirtingos grupės", "Separate groups") },
              { value: "anova", label: L("3+ grupės, ANCOVA", "3+ groups, ANCOVA"), icon: DESIGN_ICONS.anova, group: L("Skirtingos grupės", "Separate groups") },
              { value: "factorial", label: L("Du veiksniai", "Two factors"), icon: DESIGN_ICONS.factorial, group: L("Skirtingos grupės", "Separate groups") },
              { value: "chisq", label: L("Kategorijos (χ²)", "Categories (χ²)"), icon: DESIGN_ICONS.chisq, group: L("Skirtingos grupės", "Separate groups") },
              { value: "paired", label: L("Prieš ir po", "Before and after"), icon: DESIGN_ICONS.paired, group: L("Tie patys žmonės kelis kartus", "The same people more than once") },
              { value: "rm", label: L("3+ matavimai, mišri ANOVA", "3+ measurements, mixed ANOVA"), icon: DESIGN_ICONS.rm, group: L("Tie patys žmonės kelis kartus", "The same people more than once") },
              { value: "mcnemar", label: L("Taip / ne prieš ir po", "Yes/no before and after"), icon: DESIGN_ICONS.mcnemar, group: L("Tie patys žmonės kelis kartus", "The same people more than once") },
              { value: "corr", label: L("Koreliacija", "Correlation"), icon: DESIGN_ICONS.corr, group: L("Ryšiai ir modeliai", "Relationships and models") },
              { value: "reg", label: L("Tiesinė regresija", "Linear regression"), icon: DESIGN_ICONS.reg, group: L("Ryšiai ir modeliai", "Relationships and models") },
              { value: "logit", label: L("Logistinė regresija", "Logistic regression"), icon: DESIGN_ICONS.logit, group: L("Ryšiai ir modeliai", "Relationships and models") },
            ]}
          />
          <Segmented
            label={L("Ko ieškote?", "What do you need?")}
            value={solve}
            onChange={(s) => set({ solve: s })}
            hint={solve === "n" ? undefined : L("Kai imties dydį lemia aplinkybės: tiek pacientų, kiek yra.", "When circumstances set the sample: as many patients as there are.")}
            options={[
              { value: "n", label: L("Imties", "Sample size") },
              { value: "power", label: L("Turiu n: kokia galia?", "I have n: what power?") },
              { value: "effect", label: L("Turiu n: ką aptiksiu?", "I have n: what can I detect?") },
            ]}
          />
          {solve !== "n" && (
            <NumField
              label={
                !isPerGroup
                  ? L("Turima imtis", "Available sample")
                  : design === "factorial"
                    ? L("Turima imtis vienoje grupėje (langelyje)", "Available sample per cell")
                    : L("Turima imtis vienoje grupėje", "Available sample per group")
              }
              value={form.n}
              onChange={(n) => set({ n })}
              decimal={false}
              error={inputN >= 2 ? null : L("Įveskite bent 2.", "Enter at least 2.")}
            />
          )}

          {(design === "means" || design === "paired") && (
            <>
              <NumField
                label={design === "paired" ? L("Mažiausias svarbus pokytis", "Smallest important change") : L("Mažiausias svarbus skirtumas", "Smallest important difference")}
                hint={L(
                  "Kokį skirtumą būtų gaila praleisti? Jūsų matavimo vienetais: balais, mmHg, kg.",
                  "What difference would be a shame to miss? In your own units: points, mmHg, kg.",
                )}
                value={form.delta}
                onChange={(delta) => set({ delta })}
                error={parseNum(form.delta) > 0 ? null : L("Įveskite teigiamą skaičių.", "Enter a positive number.")}
              />
              <NumField
                label={design === "paired" ? L("Skirtumų standartinis nuokrypis", "SD of the differences") : L("Standartinis nuokrypis", "Standard deviation")}
                hint={spec && spec.kind === "means" ? `Cohen d = ${fmtNum(spec.delta / spec.sd)}` : spec && spec.kind === "paired" ? `Cohen dz = ${fmtNum(spec.delta / spec.sdDiff)}` : undefined}
                value={form.sd}
                onChange={(sd) => set({ sd })}
                error={parseNum(form.sd) > 0 || parseNum(form.pre) > 0 ? null : L("Įveskite teigiamą skaičių.", "Enter a positive number.")}
              />
              {design === "means" && <SdFinder form={form} set={set} />}
            </>
          )}
          {design === "props" && (
            <>
              <Segmented
                label={L("Efektą žinau kaip", "I know the effect as")}
                value={form.entry as "two" | "or"}
                onChange={(entry) => set({ entry })}
                hint={
                  form.entry === "or"
                    ? L(
                        "Atvejo–kontrolės tyrimams: ekspozicijos dalis kontrolinėje grupėje ir laukiamas šansų santykis.",
                        "For case–control studies: the share exposed among controls and the expected odds ratio.",
                      )
                    : undefined
                }
                options={[
                  { value: "two", label: L("Dvi dalys", "Two proportions") },
                  { value: "or", label: L("Šansų santykį", "An odds ratio") },
                ]}
              />
              <NumField
                label={form.entry === "or" ? L("Dalis kontrolinėje grupėje", "Share among controls") : L("1 grupė", "Group 1")}
                value={form.p1}
                onChange={(p1) => set({ p1 })}
                suffix="%"
              />
              {form.entry === "or" ? (
                <NumField
                  label={L("Šansų santykis (OR)", "Odds ratio (OR)")}
                  hint={spec?.kind === "props" ? L(`Tai atitinka ${fmtPct(spec.p1, 1)} atvejų grupėje.`, `That means ${fmtPct(spec.p1, 1)} among cases.`) : undefined}
                  value={form.or}
                  onChange={(or) => set({ or })}
                />
              ) : (
                <NumField label={L("2 grupė", "Group 2")} value={form.p2} onChange={(p2) => set({ p2 })} suffix="%" />
              )}
            </>
          )}
          {isAb && (
            <>
              <NumField label={L("Dabartinė konversija", "Current conversion rate")} value={form.base} onChange={(base) => set({ base })} suffix="%" />
              <NumField
                label={L("Mažiausias svarbus santykinis pokytis", "Smallest important relative lift")}
                hint={spec?.kind === "props" ? L(`Nuo ${fmtPct(spec.p1, 2)} iki ${fmtPct(spec.p2, 2)}.`, `From ${fmtPct(spec.p1, 2)} to ${fmtPct(spec.p2, 2)}.`) : undefined}
                value={form.lift}
                onChange={(lift) => set({ lift })}
                suffix="%"
              />
              <NumField label={L("Lankytojų per dieną, abiem versijoms kartu", "Visitors per day, both versions together")} value={form.daily} onChange={(daily) => set({ daily })} decimal={false} />
            </>
          )}
          {design === "anova" && (
            <>
              <TextField
                label={L("Laukiami grupių vidurkiai", "Expected group means")}
                hint={
                  spec?.kind === "anova"
                    ? L(`${spec.groups} grupės, Cohen f = ${fmtNum(spec.f, 3)}. Atskirkite kabliataškiu.`, `${spec.groups} groups, Cohen's f = ${fmtNum(spec.f, 3)}. Separate with semicolons.`)
                    : L("Atskirkite kabliataškiu.", "Separate with semicolons.")
                }
                value={form.means}
                onChange={(means) => set({ means })}
              />
              <NumField label={L("Standartinis nuokrypis grupėje", "Standard deviation within a group")} value={form.sd} onChange={(sd) => set({ sd })} />
              <SdFinder form={form} set={set} />
            </>
          )}
          {design === "corr" && (
            <NumField label={L("Mažiausia svarbi koreliacija (r)", "Smallest important correlation (r)")} value={form.corr} onChange={(corr) => set({ corr })} />
          )}

          {(design === "factorial" || design === "rm" || design === "chisq") && (
            <Segmented
              label={L("Efektą žinau kaip", "I know the effect as")}
              value={form.eff as "means" | "f"}
              onChange={(eff) => set({ eff })}
              options={[
                { value: "means", label: design === "chisq" ? L("Laukiamus procentus", "Expected percentages") : L("Laukiamus vidurkius", "Expected means") },
                { value: "f", label: design === "chisq" ? "Cohen w" : "Cohen f" },
              ]}
            />
          )}
          {(design === "factorial" || design === "rm" || design === "chisq") && form.eff === "f" && (
            <>
              <NumField
                label={
                  design === "factorial"
                    ? L("Pirmo veiksnio lygių", "Levels of the first factor")
                    : design === "rm"
                      ? L("Grupių (1 = viena grupė)", "Groups (1 = a single group)")
                      : L("Grupių", "Groups")
                }
                value={form.levA}
                onChange={(levA) => set({ levA })}
                decimal={false}
                error={int(form.levA) >= (design === "rm" ? 1 : 2) ? null : L(`Įveskite bent ${design === "rm" ? 1 : 2}.`, `Enter at least ${design === "rm" ? 1 : 2}.`)}
              />
              <NumField
                label={
                  design === "factorial" ? L("Antro veiksnio lygių", "Levels of the second factor") : design === "rm" ? L("Matavimų kiekvienam žmogui", "Measurements per person") : L("Atsakymo kategorijų", "Answer categories")
                }
                value={form.levB}
                onChange={(levB) => set({ levB })}
                decimal={false}
                error={int(form.levB) >= 2 ? null : L("Įveskite bent 2.", "Enter at least 2.")}
              />
              <NumField
                label={design === "chisq" ? "Cohen w" : "Cohen f"}
                hint={design === "chisq" ? L("Mažas 0,1, vidutinis 0,3, didelis 0,5 (Cohen, 1988).", "Small 0.1, medium 0.3, large 0.5 (Cohen, 1988).") : fHint}
                value={form.fval}
                onChange={(fval) => set({ fval })}
                error={parseNum(form.fval) > 0 ? null : L("Įveskite teigiamą skaičių.", "Enter a positive number.")}
              />
            </>
          )}

          {design === "factorial" && (
            <>
              {form.eff !== "f" && (
                <>
                  <TextField
                    rows={3}
                    label={L("Laukiami grupių vidurkiai", "Expected group means")}
                    hint={
                      facTable && facF
                        ? L(
                            `${facTable.length} × ${facTable[0].length}: f pirmam veiksniui ${fmtNum(facF.rows, 3)}, antram ${fmtNum(facF.cols, 3)}, sąveikai ${fmtNum(facF.inter, 3)}.`,
                            `${facTable.length} × ${facTable[0].length}: f for the first factor ${fmtNum(facF.rows, 3)}, the second ${fmtNum(facF.cols, 3)}, the interaction ${fmtNum(facF.inter, 3)}.`,
                          )
                        : L("Eilutė – pirmo veiksnio lygis, stulpelis – antro; atskirkite kabliataškiu.", "One row per level of the first factor, one column per level of the second; separate with semicolons.")
                    }
                    error={facTable && facTable.length >= 2 && facTable[0].length >= 2 ? null : L("Reikia bent 2 eilučių ir 2 stulpelių, visose eilutėse po tiek pat skaičių.", "At least 2 rows and 2 columns, the same count in every row.")}
                    value={form.fac}
                    onChange={(fac) => set({ fac })}
                  />
                  <NumField label={L("Standartinis nuokrypis grupėje", "Standard deviation within a group")} value={form.sd} onChange={(sd) => set({ sd })} />
                  <SdFinder form={form} set={set} />
                </>
              )}
              <Segmented
                label={L("Kurį efektą tikrinate?", "Which effect are you testing?")}
                value={form.facEff as "A" | "B" | "AB"}
                onChange={(facEff) => set({ facEff })}
                hint={L("Sąveikai paprastai reikia daugiausia tiriamųjų.", "An interaction usually needs the most participants.")}
                options={[
                  { value: "A", label: L("Pirmą veiksnį", "First factor") },
                  { value: "B", label: L("Antrą veiksnį", "Second factor") },
                  { value: "AB", label: L("Sąveiką", "Interaction") },
                ]}
              />
            </>
          )}

          {design === "rm" && (
            <>
              {form.eff !== "f" && (
                <>
                  <TextField
                    rows={3}
                    label={L("Laukiami vidurkiai kiekvienu matavimu", "Expected means at each measurement")}
                    hint={
                      rmTable && rmF
                        ? rmTable.length === 1
                          ? L(`${rmTable[0].length} matavimai, f laikui ${fmtNum(rmF.cols, 3)}.`, `${rmTable[0].length} measurements, f for time ${fmtNum(rmF.cols, 3)}.`)
                          : L(
                              `${rmTable.length} grupės × ${rmTable[0].length} matavimai: f laikui ${fmtNum(rmF.cols, 3)}, grupei ${fmtNum(rmF.rows, 3)}, sąveikai ${fmtNum(rmF.inter, 3)}.`,
                              `${rmTable.length} groups × ${rmTable[0].length} measurements: f for time ${fmtNum(rmF.cols, 3)}, group ${fmtNum(rmF.rows, 3)}, interaction ${fmtNum(rmF.inter, 3)}.`,
                            )
                        : L(
                            "Stulpelis – matavimas, eilutė – grupė (viena eilutė, jei grupė viena); atskirkite kabliataškiu.",
                            "One column per measurement, one row per group (a single row for one group); separate with semicolons.",
                          )
                    }
                    error={rmTable && rmTable[0].length >= 2 ? null : L("Reikia bent 2 matavimų, visose eilutėse po tiek pat skaičių.", "At least 2 measurements, the same count in every row.")}
                    value={form.rmt}
                    onChange={(rmt) => set({ rmt })}
                  />
                  <NumField label={L("Standartinis nuokrypis per matavimą", "Standard deviation at a measurement")} value={form.sd} onChange={(sd) => set({ sd })} />
                </>
              )}
              <NumField
                label={L("Koreliacija tarp matavimų", "Correlation between measurements")}
                hint={L(
                  "Kaip stipriai susiję to paties žmogaus matavimai; dažnai 0,5–0,7. Nežinant imkite 0,5.",
                  "How closely one person's measurements agree; often 0.5–0.7. If unknown, use 0.5.",
                )}
                value={form.rho}
                onChange={(rho) => set({ rho })}
                error={parseNum(form.rho) > -1 && parseNum(form.rho) < 1 ? null : L("Tarp −1 ir 1.", "Between −1 and 1.")}
              />
              {rmGroups > 1 && (
                <Segmented
                  label={L("Kurį efektą tikrinate?", "Which effect are you testing?")}
                  value={form.rmEff as RmEffect}
                  onChange={(rmEff) => set({ rmEff })}
                  hint={
                    form.rmEff === "inter"
                      ? L("Ar pokytis laike skiriasi tarp grupių: dažniausiai tai ir yra pagrindinis klausimas.", "Whether the change over time differs between groups: usually the main question.")
                      : undefined
                  }
                  options={[
                    { value: "within", label: L("Pokytį laike", "Change over time") },
                    { value: "between", label: L("Grupių skirtumą", "Group difference") },
                    { value: "inter", label: L("Grupė × laikas", "Group × time") },
                  ]}
                />
              )}
            </>
          )}

          {design === "reg" && (
            <>
              <Segmented
                label={L("Ką tikrinate?", "What are you testing?")}
                value={form.regTest as "all" | "add"}
                onChange={(regTest) => set({ regTest })}
                options={[
                  { value: "all", label: L("Ar modelis ką nors paaiškina", "Whether the model explains anything") },
                  { value: "add", label: L("Ar nauji kintamieji prideda", "Whether new variables add") },
                ]}
              />
              <NumField
                label={L("Prognozuojančių kintamųjų iš viso", "Predictors in total")}
                value={form.preds}
                onChange={(preds) => set({ preds })}
                decimal={false}
                error={int(form.preds) >= 1 ? null : L("Įveskite bent 1.", "Enter at least 1.")}
              />
              {form.regTest === "all" ? (
                <NumField
                  label={L("Kiek rezultato sklaidos paaiškins modelis (R²)", "Share of the outcome's variance the model explains (R²)")}
                  hint={
                    spec?.kind === "reg"
                      ? L(`f² = ${fmtNum(spec.r2Gain / (1 - spec.r2Gain), 3)}. Mažas R² 2 %, vidutinis 13 %, didelis 26 % (Cohen, 1988).`, `f² = ${fmtNum(spec.r2Gain / (1 - spec.r2Gain), 3)}. Small R² 2%, medium 13%, large 26% (Cohen, 1988).`)
                      : undefined
                  }
                  value={form.r2}
                  onChange={(r2) => set({ r2 })}
                  suffix="%"
                />
              ) : (
                <>
                  <NumField
                    label={L("Iš jų naujų, tikrinamų", "Of these, new ones being tested")}
                    value={form.tested}
                    onChange={(tested) => set({ tested })}
                    decimal={false}
                    error={int(form.tested) >= 1 && int(form.tested) <= int(form.preds) ? null : L("Nuo 1 iki kintamųjų skaičiaus.", "From 1 to the number of predictors.")}
                  />
                  <NumField label={L("R² be naujų kintamųjų", "R² without the new variables")} value={form.r2Base} onChange={(r2Base) => set({ r2Base })} suffix="%" />
                  <NumField
                    label={L("Kiek prideda nauji (ΔR²)", "How much the new ones add (ΔR²)")}
                    hint={spec?.kind === "reg" ? `f² = ${fmtNum(spec.r2Gain / (1 - spec.r2Base - spec.r2Gain), 3)}` : undefined}
                    value={form.r2Gain}
                    onChange={(r2Gain) => set({ r2Gain })}
                    suffix="%"
                  />
                </>
              )}
            </>
          )}

          {design === "logit" && (
            <>
              <Segmented
                label={L("Tiriamas veiksnys", "The factor tested")}
                value={form.lx as "binary" | "normal"}
                onChange={(lx) => set({ lx })}
                options={[
                  { value: "binary", label: L("Taip / ne (pvz., rūko)", "Yes/no (e.g. smokes)") },
                  { value: "normal", label: L("Skaitinis (pvz., amžius)", "Numeric (e.g. age)") },
                ]}
              />
              <NumField
                label={form.lx === "normal" ? L("Įvykio dalis, kai veiksnys vidutinis", "Event rate at the average value") : L("Įvykio dalis tarp neturinčių veiksnio", "Event rate without the factor")}
                value={form.lp0}
                onChange={(lp0) => set({ lp0 })}
                suffix="%"
              />
              <NumField
                label={form.lx === "normal" ? L("Šansų santykis 1 SD padidėjimui", "Odds ratio per 1 SD increase") : L("Šansų santykis (OR)", "Odds ratio (OR)")}
                hint={
                  spec?.kind === "logit"
                    ? form.lx === "normal"
                      ? L(`Tai ${fmtPct(p1FromOdds(spec.p0, spec.or), 1)} esant 1 SD virš vidurkio.`, `That is ${fmtPct(p1FromOdds(spec.p0, spec.or), 1)} at 1 SD above the mean.`)
                      : L(`Tai ${fmtPct(p1FromOdds(spec.p0, spec.or), 1)} tarp turinčių veiksnį.`, `That is ${fmtPct(p1FromOdds(spec.p0, spec.or), 1)} among those with the factor.`)
                    : undefined
                }
                value={form.lor}
                onChange={(lor) => set({ lor })}
                error={parseNum(form.lor) > 0 && parseNum(form.lor) !== 1 ? null : L("Teigiamas, ne 1.", "Positive, not 1.")}
              />
              {form.lx === "binary" && (
                <NumField label={L("Kuri tiriamųjų dalis turi veiksnį", "Share of participants with the factor")} value={form.lshare} onChange={(lshare) => set({ lshare })} suffix="%" />
              )}
            </>
          )}

          {design === "chisq" && form.eff !== "f" && (
            <TextField
              rows={3}
              label={L("Laukiamas pasiskirstymas, %", "Expected distribution, %")}
              hint={
                spec?.kind === "chisq" && chisqTable
                  ? L(
                      `${chisqTable.length} grupės × ${chisqTable[0].length} kategorijos, w = ${fmtNum(spec.w, 3)}. Grupės laikomos vienodo dydžio.`,
                      `${chisqTable.length} groups × ${chisqTable[0].length} categories, w = ${fmtNum(spec.w, 3)}. The groups are taken to be equal in size.`,
                    )
                  : L("Eilutė – grupė, stulpelis – atsakymo kategorija; atskirkite kabliataškiu.", "One row per group, one column per answer category; separate with semicolons.")
              }
              error={
                chisqTable && chisqTable.length >= 2 && chisqTable[0].length >= 2 && chisqTable.flat().every((x) => x > 0)
                  ? null
                  : L("Reikia bent 2 eilučių ir 2 stulpelių teigiamų skaičių.", "At least 2 rows and 2 columns of positive numbers.")
              }
              value={form.ctab}
              onChange={(ctab) => set({ ctab })}
            />
          )}

          {design === "mcnemar" && (
            <>
              <NumField label={L("„Taip“ pirmą kartą", "“Yes” the first time")} value={form.mp1} onChange={(mp1) => set({ mp1 })} suffix="%" />
              <NumField label={L("„Taip“ antrą kartą", "“Yes” the second time")} value={form.mp2} onChange={(mp2) => set({ mp2 })} suffix="%" />
              <NumField
                label={L("Kiek žmonių pakeis atsakymą", "Share of people who change their answer")}
                hint={L(
                  "Nežinant palikite tuščią: imama, lyg atsakymai būtų nepriklausomi, o tai atsargu.",
                  "Leave empty if unknown: the answers are then treated as independent, which is cautious.",
                )}
                placeholder={(() => {
                  const [a, b] = [parseNum(form.mp1) / 100, parseNum(form.mp2) / 100];
                  return a > 0 && b > 0 ? fmtShort((a * (1 - b) + b * (1 - a)) * 100, 1) : "";
                })()}
                value={form.mdisc}
                onChange={(mdisc) => set({ mdisc })}
                suffix="%"
                error={
                  spec || !(parseNum(form.mp1) > 0 && parseNum(form.mp2) > 0)
                    ? null
                    : L(
                        `Neįmanoma: pakeisti turi bent ${fmtShort(Math.abs(parseNum(form.mp1) - parseNum(form.mp2)), 1)} %, o „taip“ dalys turi skirtis.`,
                        `Not possible: at least ${fmtShort(Math.abs(parseNum(form.mp1) - parseNum(form.mp2)), 1)}% must change, and the two shares must differ.`,
                      )
                }
              />
            </>
          )}

          <Segmented
            label={L("Statistinė galia", "Statistical power")}
            hint={L("Tikimybė pamatyti efektą, jei jis tikrai yra.", "The chance of seeing the effect if it is really there.")}
            value={form.power as "80" | "90" | "95"}
            onChange={(p) => set({ power: p })}
            options={[
              { value: "80", label: `80${PCT}` },
              { value: "90", label: `90${PCT}` },
              { value: "95", label: `95${PCT}` },
            ]}
          />
          {solve === "n" && !isAb && (
            <NumField
              label={L("Numatomas nubyrėjimas", "Expected dropout")}
              hint={L("Kiek tiriamųjų neužbaigs tyrimo?", "How many participants will not finish the study?")}
              value={form.drop}
              onChange={(drop) => set({ drop })}
              suffix="%"
            />
          )}

          <More title={L("Daugiau nustatymų", "More settings")}>
            <NumField label={L("Reikšmingumo lygis α", "Significance level α")} value={form.alpha} onChange={(alpha) => set({ alpha })} />
            {(design === "anova" || design === "factorial") && (
              <>
                <NumField
                  label={L("Kovariančių (ANCOVA)", "Covariates (ANCOVA)")}
                  hint={L("Pvz., pradinis įvertis prieš gydymą. 0 = be kovariančių.", "E.g. the baseline score before treatment. 0 = none.")}
                  value={form.cov}
                  onChange={(cov) => set({ cov })}
                  decimal={false}
                />
                {int(form.cov) > 0 && (
                  <NumField
                    label={L("Kovariančių ir rezultato koreliacija (R)", "Correlation of the covariates with the outcome (R)")}
                    hint={L(
                      "Pradinio ir galutinio įverčio koreliacija dažnai 0,5–0,7. Kuo ji didesnė, tuo mažiau reikia tiriamųjų.",
                      "Baseline and follow-up scores often correlate 0.5–0.7. The higher it is, the fewer participants are needed.",
                    )}
                    value={form.covR}
                    onChange={(covR) => set({ covR })}
                    error={parseNum(form.covR) >= 0 && parseNum(form.covR) < 1 ? null : L("Nuo 0 iki 1.", "From 0 to 1.")}
                  />
                )}
              </>
            )}
            {design === "rm" && (
              <NumField
                label={L("Sferiškumo pataisa ε", "Sphericity correction ε")}
                hint={L(
                  `1 = sferiškumas tenkinamas. Mažiausia ${spec?.kind === "rm" ? fmtShort(1 / (spec.times - 1), 2) : "1/(m − 1)"}; atsargiai galima imti 0,75.`,
                  `1 = sphericity holds. The lowest is ${spec?.kind === "rm" ? fmtShort(1 / (spec.times - 1), 2) : "1/(m − 1)"}; 0.75 is a cautious choice.`,
                )}
                value={form.eps}
                onChange={(eps) => set({ eps })}
              />
            )}
            {design === "logit" && (
              <NumField
                label={L("Kiek veiksnį paaiškina kiti modelio kintamieji (R²)", "How much the other predictors explain the factor (R²)")}
                hint={L("0 = kitų kintamųjų nėra arba jie nesusiję. Kuo labiau susiję, tuo daugiau reikia.", "0 = no other predictors, or unrelated ones. The more related, the more participants are needed.")}
                value={form.lr2}
                onChange={(lr2) => set({ lr2 })}
                suffix="%"
              />
            )}
            {!["anova", "factorial", "rm", "reg", "chisq"].includes(design) && (
              <Segmented
                label={L("Testas", "Test")}
                value={form.sides as "1" | "2"}
                onChange={(sides) => set({ sides })}
                options={[
                  { value: "2", label: L("Dvipusis", "Two-sided") },
                  { value: "1", label: L("Vienpusis", "One-sided") },
                ]}
              />
            )}
            {hasRatio && (
              <NumField
                label={
                  design === "props" && form.entry === "or"
                    ? L("Kiek kontrolių vienam atvejui?", "How many controls per case?")
                    : L("Kiek kartų 2 grupė didesnė?", "How many times larger is group 2?")
                }
                hint={L("1 = lygios grupės.", "1 = equal groups.")}
                value={form.ratio}
                onChange={(ratio) => set({ ratio })}
              />
            )}
            <NumField
              label={L("Kiek palyginimų darysite?", "How many comparisons will you make?")}
              hint={L("Daugiau nei 1 mažina α pagal Bonferroni.", "More than 1 lowers α by Bonferroni.")}
              value={form.m}
              onChange={(m) => set({ m })}
              decimal={false}
            />
            {(design === "means" || design === "paired" || design === "anova") && (
              <Check
                label={L(
                  "Duomenys nenormalūs: planuoju Mann-Whitney, Wilcoxon ar Kruskal-Wallis (+16 %)",
                  "Data not normal: I plan Mann-Whitney, Wilcoxon or Kruskal-Wallis (+16%)",
                )}
                checked={form.rank === "1"}
                onChange={(v) => set({ rank: v ? "1" : "0" })}
              />
            )}
            {design === "paired" && (
              <>
                <p className="hint">{L("Neturite skirtumų SD? Jį galima apskaičiuoti:", "No SD of the differences? It can be worked out:")}</p>
                <NumField label={L("Vieno matavimo SD", "SD of one measurement")} value={form.pre} onChange={(pre) => set({ pre })} placeholder={L("neprivaloma", "optional")} />
                <NumField label={L("Koreliacija tarp matavimų", "Correlation between measurements")} value={form.r} onChange={(r) => set({ r })} />
              </>
            )}
          </More>
          {calc?.groups && (
            <Peek
              value={solve === "n" ? fmtInt(total) : solve === "power" ? fmtPct(calc.achieved, 0) : spec && calc.effect !== null ? effectText(spec, calc.effect) : "–"}
              label={solve === "n" ? word(total, unit) : solve === "power" ? L("galia", "power") : L("aptiksite", "detectable")}
            />
          )}
        </form>

        <div className="result" aria-live="polite">
          {!calc ? (
            <p className="result-empty">{L("Užpildykite pažymėtus laukus.", "Fill in the marked fields.")}</p>
          ) : solve === "n" ? (
            calc.groups ? (
              <>
                <span className="eyebrow">{L("Rezultatas", "Result")}</span>
                <p className="big">{fmtInt(total)}</p>
                <p className="big-unit">
                  {word(total, unit)}
                  {calc.groups.length > 1 &&
                    (calc.groups.every((g) => g === calc.groups![0])
                      ? L(` (po ${fmtInt(calc.groups[0])} ${isAb ? "versijai" : "grupėje"})`, ` (${fmtInt(calc.groups[0])} per ${isAb ? "version" : "group"})`)
                      : ` (${calc.groups.map(fmtInt).join(" + ")})`)}
                </p>
                <p className="result-brief">
                  {L(
                    <>
                      Jei tikrasis efektas toks, kokį numatėte, {isAb ? "testas" : "tyrimas"} jį aptiks <b>{fmtPct(calc.achieved)}</b> tikimybe.
                    </>,
                    <>
                      If the true effect is as large as you assumed, the {isAb ? "test" : "study"} will detect it with <b>{fmtPct(calc.achieved)}</b>{" "}
                      probability.
                    </>,
                  )}
                  {days !== null && Number.isFinite(days) && (
                    <>
                      {" "}
                      {L("Testas turi trukti bent", "Run the test for at least")} <b>{fmtInt(days)}</b> {plural(days, ["dieną", "dienas", "dienų"], ["day", "days"])}
                      {days < 7
                        ? L(", bet ne trumpiau nei savaitę dėl savaitės dienų skirtumų", ", but no less than a week, because weekdays differ")
                        : days > 56
                          ? L(". Tai ilgiau nei paprastai verta: ieškokite didesnio efekto ar srauto", ". That is longer than usually worth it: look for a larger effect or more traffic")
                          : ""}
                      .
                    </>
                  )}
                  {!isAb && dropout > 0 && (
                    <>
                      {" "}
                      {L("Įtraukite", "Enrol")} <b>{fmtInt(enrolledTotal)}</b>
                      {L(`, nes ${fmtPct(dropout, 0)} nubyrės.`, `, as ${fmtPct(dropout, 0)} will drop out.`)}
                    </>
                  )}
                </p>
                {fall && (
                  <Notice kind="info" title={L("Patikrinkite prielaidą.", "Check the assumption.")}>
                    {L(
                      `Jei tikrasis efektas ${fall.k === 0.8 ? "20" : "15"} % mažesnis, su šia imtimi galia kris iki ${fmtPct(fall.power, 0)}.`,
                      `If the true effect is ${fall.k === 0.8 ? "20" : "15"}% smaller, power with this sample drops to ${fmtPct(fall.power, 0)}.`,
                    )}
                  </Notice>
                )}
                {report && <StatementBox statement={report.statement} />}
              </>
            ) : (
              <Notice title={L("Tokio efekto realia imtimi neaptiksite.", "No realistic sample will detect this effect.")}>
                {L("Padidinkite efektą arba sumažinkite galią.", "Increase the effect or lower the power.")}
              </Notice>
            )
          ) : solve === "power" ? (
            <>
              <span className="eyebrow">{L("Galia", "Power")}</span>
              <p className="big">{fmtPct(calc.achieved, 0)}</p>
              <p className="big-unit">
                {L("su", "with")} {fmtInt(total)} {word(total, unitWith)}
              </p>
              <p className="result-line">
                {L(
                  "Jei efektas tikrai toks, iš 100 tokių tyrimų jį aptiktų maždaug",
                  "If the effect is really this large, out of 100 such studies about",
                )}{" "}
                <b>{fmtInt(Math.round(calc.achieved * 100))}</b>
                {L(".", " would detect it.")}
              </p>
              {calc.achieved < 0.5 && (
                <Notice title={L("Daugiau tikėtina nieko nerasti nei rasti.", "Finding nothing is more likely than finding it.")}>
                  {L("Nereikšmingas rezultatas čia nerodys, kad skirtumo nėra.", "A non-significant result here will not show that there is no difference.")}
                </Notice>
              )}
            </>
          ) : (
            <>
              <span className="eyebrow">{L("Aptiksite", "You can detect")}</span>
              {calc.effect !== null && spec ? (
                <>
                  <p className="big big-text">{effectText(spec, calc.effect)}</p>
                  <p className="big-unit">
                    {L(
                      `ar didesnį efektą, su ${fmtPct(target, 0)} galia ir ${fmtInt(total)} ${word(total, unitWith)}`,
                      `or a larger effect, with ${fmtPct(target, 0)} power and ${fmtInt(total)} ${word(total, unitWith)}`,
                    )}
                  </p>
                  <p className="result-line">
                    {L(
                      "Mažesni efektai gali likti nepastebėti. Ar toks skirtumas apskritai realus jūsų srityje?",
                      "Smaller effects may go unnoticed. Is a difference this large realistic in your field at all?",
                    )}
                  </p>
                </>
              ) : (
                <Notice title={L("Su tokia imtimi šios galios nepasieksite.", "This sample cannot reach that power.")} />
              )}
            </>
          )}
          {smallForChisq && (
            <Notice title={L("Maži laukiami dažniai.", "Small expected counts.")}>
              {L(
                "Kai kuriame langelyje laukiama mažiau nei 5 atsakymų: χ² testas bus netikslus. Sujunkite retas kategorijas arba didinkite imtį.",
                "Some cell expects fewer than 5 answers, where the χ² test is unreliable. Merge rare categories or enlarge the sample.",
              )}
            </Notice>
          )}
          {smallForProps && (
            <Notice title={L("Maža imtis.", "Small sample.")}>
              {L(
                "Laukiama mažiau nei 5 įvykių grupėje: planuokite Fišerio tikslųjį testą ir imties atsargą.",
                "Fewer than 5 events are expected in a group: plan Fisher's exact test and a margin in the sample.",
              )}
            </Notice>
          )}
        </div>
      </div>

      {curve && planned !== null && (
        <section className="block" aria-labelledby="curve-title">
          <h2 id="curve-title">{L("Kaip galia priklauso nuo imties", "How power depends on sample size")}</h2>
          <PowerCurve
            xs={curve.xs}
            series={curve.series}
            target={target}
            mark={planned}
            xTitle={
              !isPerGroup
                ? L("Imtis", "Sample size")
                : design === "means" || design === "props" || design === "ab"
                  ? L("Imtis 1 grupėje", "Sample size in group 1")
                  : design === "factorial"
                    ? L("Imtis vienoje grupėje (langelyje)", "Sample size per cell")
                    : L("Imtis vienoje grupėje", "Sample size per group")
            }
            ariaLabel={L(
              `Statistinė galia pagal imties dydį trims efekto dydžiams. Su ${planned} galia ${fmtPct(calc?.achieved ?? 0, 0)}.`,
              `Statistical power by sample size for three effect sizes. With ${planned}, power is ${fmtPct(calc?.achieved ?? 0, 0)}.`,
            )}
          />
        </section>
      )}

      {scenarios.length > 0 && (
        <section className="block" aria-labelledby="scen2-title">
          <h2 id="scen2-title">{L("Kas, jeigu efektas kitoks?", "What if the effect were different?")}</h2>
          <p className="block-lead">
            {L("Efektas yra prielaida, todėl verta matyti, kas nutiktų, jei ji neišsipildytų.", "The effect is an assumption, so it pays to see what happens if it does not hold.")}
          </p>
          <div className="table-scroll">
            <table className="scenarios">
              <thead>
                <tr>
                  <th>{L("Tikrasis efektas", "True effect")}</th>
                  <th className="cell-num">{L("Tada reikėtų, iš viso", "Total needed then")}</th>
                  <th className="cell-num">{L("Jūsų imties galia", "Power of your sample")}</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.k} className={s.k === 1 ? "current-row" : ""}>
                    <td>{s.label}</td>
                    <td className="cell-num">{s.n === null ? L("per daug", "too many") : fmtInt(s.n)}</td>
                    <td className="cell-num">{fmtPct(s.power, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {report && <ReportBlock report={report} />}
    </>
  );
}
