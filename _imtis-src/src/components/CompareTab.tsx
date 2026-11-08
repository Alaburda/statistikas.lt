import { useMemo } from "react";
import {
  RANK_ARE,
  cohenF,
  effectOf,
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
};

type Design = "means" | "paired" | "props" | "ab" | "anova" | "corr";
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
    anova: "Trys ar daugiau atskirų grupių; lyginami vidurkiai (vienfaktorė ANOVA).",
    corr: "Viena grupė, du kiekybiniai matavimai kiekvienam; ar jie susiję (Pirsono r).",
  },
  {
    means: "Two separate groups (e.g. treatment and control), each person measured once; the means are compared.",
    paired: "The same people measured twice (before and after), or matched pairs; the change is assessed.",
    props: "Two groups with a yes/no outcome (e.g. recovered or not); the proportions are compared. Also for case–control studies.",
    ab: "Two versions of a page or an email, visitors split at random; the conversion rates are compared.",
    anova: "Three or more separate groups; the means are compared (one-way ANOVA).",
    corr: "One group, two numeric measurements per person; are they related (Pearson's r)?",
  },
);

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
      if (means.length < 2 || means.some(Number.isNaN) || !(sd > 0)) return null;
      const effect = cohenF(means, sd);
      return effect > 0 ? { kind: "anova", groups: means.length, f: effect } : null;
    }
    case "corr": {
      const r = parseNum(f.corr);
      return r !== 0 && Math.abs(r) < 1 ? { kind: "corr", r } : null;
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
      return `f = ${fmtNum(e, 3)}`;
    case "corr":
      return `r = ${fmtNum(e, 3)}`;
  }
}

function sharesValid(spec: Extract<Spec, { kind: "props" }>, e: number): boolean {
  const { p1, p2 } = propsAt(spec, e);
  return p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1;
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
    const factors = spec.kind === "corr" || spec.kind === "props" ? [0.7, 0.85, 1, 1.15] : [0.6, 0.8, 1, 1.25, 1.5];
    return factors.flatMap((k) => {
      const s = withEffect(spec, ownEffect * k);
      if (spec.kind === "corr" && ownEffect * k >= 1) return [];
      if (spec.kind === "props" && !sharesValid(spec, ownEffect * k)) return [];
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
    const maxN = Math.max(Math.ceil(planned * 2), 8);
    const lo = spec.kind === "corr" ? 5 : 3;
    const count = 80;
    const xs = Array.from(new Set(Array.from({ length: count }, (_, i) => Math.round(lo + ((maxN - lo) * i) / (count - 1)))));
    const series: CurveSeries[] = lines
      .filter((l) => {
        if (spec.kind === "corr") return ownEffect * l.k < 1;
        return spec.kind === "props" ? sharesValid(spec, ownEffect * l.k) : true;
      })
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
        })
      : null;

  return (
    <>
      <div className="calc">
        <form className="inputs" onSubmit={(e) => e.preventDefault()}>
          <Segmented
            label={L("Ką lyginate?", "What are you comparing?")}
            value={design}
            onChange={(d) => set({ design: d, ratio: "1" })}
            hint={<span className="design-note">{DESIGN_NOTES[design]}</span>}
            options={[
              { value: "means", label: L("Dvi grupės, vidurkiai", "Two groups, means"), icon: DESIGN_ICONS.means },
              { value: "paired", label: L("Prieš ir po", "Before and after"), icon: DESIGN_ICONS.paired },
              { value: "props", label: L("Dvi grupės, dalys", "Two groups, proportions"), icon: DESIGN_ICONS.props },
              { value: "ab", label: L("A/B testas", "A/B test"), icon: DESIGN_ICONS.ab },
              { value: "anova", label: L("3+ grupės", "3+ groups"), icon: DESIGN_ICONS.anova },
              { value: "corr", label: L("Koreliacija", "Correlation"), icon: DESIGN_ICONS.corr },
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
              label={design === "paired" || design === "corr" ? L("Turima imtis", "Available sample") : L("Turima imtis vienoje grupėje", "Available sample per group")}
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
            {design !== "anova" && (
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
            xTitle={design === "paired" || design === "corr" ? L("Imtis", "Sample size") : L("Imtis 1 grupėje", "Sample size in group 1")}
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
