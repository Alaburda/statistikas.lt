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
import { fmtInt, fmtNum, fmtPct, fmtShort, ltPlural, parseNum } from "../format";
import { compareReport } from "../report";
import { useForm } from "../url";
import { Check, More, NumField, Notice, Peek, Segmented, TextField } from "./Fields";
import { PowerCurve, type CurveSeries } from "./PowerCurve";
import { ReportBlock } from "./ReportBlock";

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

const SUBJECTS: [string, string, string] = ["tiriamasis", "tiriamieji", "tiriamųjų"];
const VISITORS: [string, string, string] = ["lankytojas", "lankytojai", "lankytojų"];
const PAIRS: [string, string, string] = ["pora matavimų", "poros matavimų", "porų matavimų"];

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
      return `${fmtShort(e, 3)} vnt. (d = ${fmtNum(e / spec.sd)})`;
    case "paired":
      return `${fmtShort(e, 3)} vnt. (dz = ${fmtNum(e / spec.sdDiff)})`;
    case "props": {
      const at = propsAt(spec, e);
      return spec.fixed === "p2"
        ? `${fmtPct(at.p1, 2)} prieš ${fmtPct(at.p2, 2)} kontrolėje`
        : `nuo ${fmtPct(at.p1, 2)} iki ${fmtPct(at.p2, 2)}`;
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
  const use = (v: number) => set({ sd: fmtShort(v, 2).replace(/\s/g, "") });
  const pick = (find: string) => set({ find, h1: "", h2: "", h3: "", h4: "" });
  return (
    <More title="Neturite standartinio nuokrypio?">
      <p className="hint">Straipsnyje dažnai būna ne SD, o kas nors kita. Pasirinkite, ką turite:</p>
      <div className="chips">
        <button type="button" className={kind === "ci" ? "on" : ""} onClick={() => pick("ci")}>
          95 % PI
        </button>
        <button type="button" className={kind === "iqr" ? "on" : ""} onClick={() => pick("iqr")}>
          Kvartiliai
        </button>
        <button type="button" className={kind === "two" ? "on" : ""} onClick={() => pick("two")}>
          Dviejų grupių SD
        </button>
        <button type="button" className={kind === "pilot" ? "on" : ""} onClick={() => pick("pilot")}>
          Pilotinis tyrimas
        </button>
      </div>
      {kind === "ci" && (
        <>
          <NumField label="PI apatinė riba" value={form.h1} onChange={(h1) => set({ h1 })} />
          <NumField label="PI viršutinė riba" value={form.h2} onChange={(h2) => set({ h2 })} />
          <NumField label="Tiriamųjų toje grupėje" value={form.h3} onChange={(h3) => set({ h3 })} decimal={false} />
          {Number.isFinite(fromCi) && <SdResult value={fromCi} use={use} />}
        </>
      )}
      {kind === "iqr" && (
        <>
          <NumField label="1 kvartilis (Q1)" value={form.h1} onChange={(h1) => set({ h1 })} />
          <NumField label="3 kvartilis (Q3)" value={form.h2} onChange={(h2) => set({ h2 })} />
          {Number.isFinite(fromIqr) && <SdResult value={fromIqr} use={use} note="Tinka apytiksliai simetriškiems duomenims." />}
        </>
      )}
      {kind === "two" && (
        <>
          <NumField label="1 grupės SD" value={form.h1} onChange={(h1) => set({ h1 })} />
          <NumField label="1 grupės n" value={form.h2} onChange={(h2) => set({ h2 })} decimal={false} />
          <NumField label="2 grupės SD" value={form.h3} onChange={(h3) => set({ h3 })} />
          <NumField label="2 grupės n" value={form.h4} onChange={(h4) => set({ h4 })} decimal={false} />
          {Number.isFinite(fromTwo) && <SdResult value={fromTwo} use={use} />}
        </>
      )}
      {kind === "pilot" && (
        <>
          <NumField label="Piloto SD" value={form.h1} onChange={(h1) => set({ h1 })} />
          <NumField label="Piloto n" value={form.h2} onChange={(h2) => set({ h2 })} decimal={false} />
          {Number.isFinite(pilot) && (
            <SdResult value={pilot} use={use} note="Viršutinė 80 % riba: mažo piloto SD dažnai būna per optimistiškas (Browne, 1995)." />
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
        Naudoti
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
      { k: 1, label: "Planuojamas efektas", color: "#1F45A0" },
      { k: 0.8, label: "20 % mažesnis", color: "#C23B2A", dash: "7 5" },
      { k: 1.2, label: "20 % didesnis", color: "#6B675F", dash: "2 4" },
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
            label="Ką lyginate?"
            value={design}
            onChange={(d) => set({ design: d, ratio: "1" })}
            options={[
              { value: "means", label: "Dvi grupės, vidurkiai" },
              { value: "paired", label: "Prieš ir po" },
              { value: "props", label: "Dvi grupės, dalys" },
              { value: "ab", label: "A/B testas" },
              { value: "anova", label: "3+ grupės" },
              { value: "corr", label: "Koreliacija" },
            ]}
          />
          <Segmented
            label="Ko ieškote?"
            value={solve}
            onChange={(s) => set({ solve: s })}
            hint={solve === "n" ? undefined : "Kai imties dydį lemia aplinkybės: tiek pacientų, kiek yra."}
            options={[
              { value: "n", label: "Imties" },
              { value: "power", label: "Turiu n: kokia galia?" },
              { value: "effect", label: "Turiu n: ką aptiksiu?" },
            ]}
          />
          {solve !== "n" && (
            <NumField
              label={design === "paired" || design === "corr" ? "Turima imtis" : "Turima imtis vienoje grupėje"}
              value={form.n}
              onChange={(n) => set({ n })}
              decimal={false}
              error={inputN >= 2 ? null : "Įveskite bent 2."}
            />
          )}

          {(design === "means" || design === "paired") && (
            <>
              <NumField
                label={design === "paired" ? "Mažiausias svarbus pokytis" : "Mažiausias svarbus skirtumas"}
                hint="Kokį skirtumą būtų gaila praleisti? Jūsų matavimo vienetais: balais, mmHg, kg."
                value={form.delta}
                onChange={(delta) => set({ delta })}
                error={parseNum(form.delta) > 0 ? null : "Įveskite teigiamą skaičių."}
              />
              <NumField
                label={design === "paired" ? "Skirtumų standartinis nuokrypis" : "Standartinis nuokrypis"}
                hint={spec && spec.kind === "means" ? `Cohen d = ${fmtNum(spec.delta / spec.sd)}` : spec && spec.kind === "paired" ? `Cohen dz = ${fmtNum(spec.delta / spec.sdDiff)}` : undefined}
                value={form.sd}
                onChange={(sd) => set({ sd })}
                error={parseNum(form.sd) > 0 || parseNum(form.pre) > 0 ? null : "Įveskite teigiamą skaičių."}
              />
              {design === "means" && <SdFinder form={form} set={set} />}
            </>
          )}
          {design === "props" && (
            <>
              <Segmented
                label="Efektą žinau kaip"
                value={form.entry as "two" | "or"}
                onChange={(entry) => set({ entry })}
                hint={form.entry === "or" ? "Atvejo–kontrolės tyrimams: ekspozicijos dalis kontrolinėje grupėje ir laukiamas šansų santykis." : undefined}
                options={[
                  { value: "two", label: "Dvi dalys" },
                  { value: "or", label: "Šansų santykį" },
                ]}
              />
              <NumField label={form.entry === "or" ? "Dalis kontrolinėje grupėje" : "1 grupė"} value={form.p1} onChange={(p1) => set({ p1 })} suffix="%" />
              {form.entry === "or" ? (
                <NumField
                  label="Šansų santykis (OR)"
                  hint={spec?.kind === "props" ? `Tai atitinka ${fmtPct(spec.p1, 1)} atvejų grupėje.` : undefined}
                  value={form.or}
                  onChange={(or) => set({ or })}
                />
              ) : (
                <NumField label="2 grupė" value={form.p2} onChange={(p2) => set({ p2 })} suffix="%" />
              )}
            </>
          )}
          {isAb && (
            <>
              <NumField label="Dabartinė konversija" value={form.base} onChange={(base) => set({ base })} suffix="%" />
              <NumField
                label="Mažiausias svarbus santykinis pokytis"
                hint={spec?.kind === "props" ? `Nuo ${fmtPct(spec.p1, 2)} iki ${fmtPct(spec.p2, 2)}.` : undefined}
                value={form.lift}
                onChange={(lift) => set({ lift })}
                suffix="%"
              />
              <NumField label="Lankytojų per dieną, abiem versijoms kartu" value={form.daily} onChange={(daily) => set({ daily })} decimal={false} />
            </>
          )}
          {design === "anova" && (
            <>
              <TextField
                label="Laukiami grupių vidurkiai"
                hint={spec?.kind === "anova" ? `${spec.groups} grupės, Cohen f = ${fmtNum(spec.f, 3)}. Atskirkite kabliataškiu.` : "Atskirkite kabliataškiu."}
                value={form.means}
                onChange={(means) => set({ means })}
              />
              <NumField label="Standartinis nuokrypis grupėje" value={form.sd} onChange={(sd) => set({ sd })} />
              <SdFinder form={form} set={set} />
            </>
          )}
          {design === "corr" && <NumField label="Mažiausia svarbi koreliacija (r)" value={form.corr} onChange={(corr) => set({ corr })} />}

          <Segmented
            label="Statistinė galia"
            hint="Tikimybė pamatyti efektą, jei jis tikrai yra."
            value={form.power as "80" | "90" | "95"}
            onChange={(p) => set({ power: p })}
            options={[
              { value: "80", label: "80 %" },
              { value: "90", label: "90 %" },
              { value: "95", label: "95 %" },
            ]}
          />
          {solve === "n" && !isAb && (
            <NumField label="Numatomas nubyrėjimas" hint="Kiek tiriamųjų neužbaigs tyrimo?" value={form.drop} onChange={(drop) => set({ drop })} suffix="%" />
          )}

          <More title="Daugiau nustatymų">
            <NumField label="Reikšmingumo lygis α" value={form.alpha} onChange={(alpha) => set({ alpha })} />
            {design !== "anova" && (
              <Segmented
                label="Testas"
                value={form.sides as "1" | "2"}
                onChange={(sides) => set({ sides })}
                options={[
                  { value: "2", label: "Dvipusis" },
                  { value: "1", label: "Vienpusis" },
                ]}
              />
            )}
            {hasRatio && (
              <NumField
                label={design === "props" && form.entry === "or" ? "Kiek kontrolių vienam atvejui?" : "Kiek kartų 2 grupė didesnė?"}
                hint="1 = lygios grupės."
                value={form.ratio}
                onChange={(ratio) => set({ ratio })}
              />
            )}
            <NumField
              label="Kiek palyginimų darysite?"
              hint="Daugiau nei 1 mažina α pagal Bonferroni."
              value={form.m}
              onChange={(m) => set({ m })}
              decimal={false}
            />
            {(design === "means" || design === "paired" || design === "anova") && (
              <Check
                label="Duomenys nenormalūs: planuoju Mann-Whitney, Wilcoxon ar Kruskal-Wallis (+16 %)"
                checked={form.rank === "1"}
                onChange={(v) => set({ rank: v ? "1" : "0" })}
              />
            )}
            {design === "paired" && (
              <>
                <p className="hint">Neturite skirtumų SD? Jį galima apskaičiuoti:</p>
                <NumField label="Vieno matavimo SD" value={form.pre} onChange={(pre) => set({ pre })} placeholder="neprivaloma" />
                <NumField label="Koreliacija tarp matavimų" value={form.r} onChange={(r) => set({ r })} />
              </>
            )}
          </More>
          {calc?.groups && (
            <Peek
              value={solve === "n" ? fmtInt(total) : solve === "power" ? fmtPct(calc.achieved, 0) : spec && calc.effect !== null ? effectText(spec, calc.effect) : "–"}
              label={solve === "n" ? ltPlural(total, unit) : solve === "power" ? "galia" : "aptiksite"}
            />
          )}
        </form>

        <div className="result" aria-live="polite">
          {!calc ? (
            <p className="result-empty">Užpildykite pažymėtus laukus.</p>
          ) : solve === "n" ? (
            calc.groups ? (
              <>
                <span className="eyebrow">Atsakymas</span>
                <p className="big">{fmtInt(total)}</p>
                <p className="big-unit">
                  {ltPlural(total, unit)}
                  {calc.groups.length > 1 &&
                    (calc.groups.every((g) => g === calc.groups![0])
                      ? ` (po ${fmtInt(calc.groups[0])} ${isAb ? "versijai" : "grupėje"})`
                      : ` (${calc.groups.map(fmtInt).join(" + ")})`)}
                </p>
                {days !== null && Number.isFinite(days) && (
                  <p className="result-line">
                    Testas turi trukti bent <b>{fmtInt(days)}</b> {ltPlural(days, ["dieną", "dienas", "dienų"])}
                    {days < 7 ? ", bet ne trumpiau nei savaitę dėl savaitės dienų skirtumų" : days > 56 ? ". Tai ilgiau nei paprastai verta: ieškokite didesnio efekto ar srauto" : ""}.
                  </p>
                )}
                {!isAb && dropout > 0 && (
                  <p className="result-line">
                    Įtraukite <b>{fmtInt(enrolledTotal)}</b>, nes {fmtPct(dropout, 0)} nubyrės.
                  </p>
                )}
                <p className="result-alt">Faktinė galia {fmtPct(calc.achieved)}</p>
                {fall && (
                  <Notice kind="info" title="Patikrinkite prielaidą.">
                    Jei tikrasis efektas {fall.k === 0.8 ? "20" : "15"} % mažesnis, su šia imtimi galia kris iki {fmtPct(fall.power, 0)}.
                  </Notice>
                )}
              </>
            ) : (
              <Notice title="Tokio efekto realia imtimi neaptiksite.">Padidinkite efektą arba sumažinkite galią.</Notice>
            )
          ) : solve === "power" ? (
            <>
              <span className="eyebrow">Galia</span>
              <p className="big">{fmtPct(calc.achieved, 0)}</p>
              <p className="big-unit">su {fmtInt(total)} {ltPlural(total, unit)}</p>
              <p className="result-line">
                Jei efektas tikrai toks, iš 100 tokių tyrimų jį aptiktų maždaug <b>{fmtInt(Math.round(calc.achieved * 100))}</b>.
              </p>
              {calc.achieved < 0.5 && (
                <Notice title="Daugiau tikėtina nieko nerasti nei rasti.">Nereikšmingas rezultatas čia nerodys, kad skirtumo nėra.</Notice>
              )}
            </>
          ) : (
            <>
              <span className="eyebrow">Aptiksite</span>
              {calc.effect !== null && spec ? (
                <>
                  <p className="big big-text">{effectText(spec, calc.effect)}</p>
                  <p className="big-unit">
                    ar didesnį efektą, su {fmtPct(target, 0)} galia ir {fmtInt(total)} {ltPlural(total, unit)}
                  </p>
                  <p className="result-line">Mažesni efektai gali likti nepastebėti. Ar toks skirtumas apskritai realus jūsų srityje?</p>
                </>
              ) : (
                <Notice title="Su tokia imtimi šios galios nepasieksite." />
              )}
            </>
          )}
          {smallForProps && <Notice title="Maža imtis.">Laukiama mažiau nei 5 įvykių grupėje: planuokite Fišerio tikslųjį testą ir imties atsargą.</Notice>}
        </div>
      </div>

      {curve && planned !== null && (
        <section className="block" aria-labelledby="curve-title">
          <h2 id="curve-title">Kaip galia priklauso nuo imties</h2>
          <PowerCurve
            xs={curve.xs}
            series={curve.series}
            target={target}
            mark={planned}
            xTitle={design === "paired" || design === "corr" ? "Imtis" : "Imtis 1 grupėje"}
            ariaLabel={`Statistinė galia pagal imties dydį trims efekto dydžiams. Su ${planned} galia ${fmtPct(calc?.achieved ?? 0, 0)}.`}
          />
        </section>
      )}

      {scenarios.length > 0 && (
        <section className="block" aria-labelledby="scen2-title">
          <h2 id="scen2-title">Kas, jeigu efektas kitoks?</h2>
          <p className="block-lead">Efektas yra prielaida, todėl verta matyti, kas nutiktų, jei ji neišsipildytų.</p>
          <div className="table-scroll">
            <table className="scenarios">
              <thead>
                <tr>
                  <th>Tikrasis efektas</th>
                  <th className="cell-num">Tada reikėtų, iš viso</th>
                  <th className="cell-num">Jūsų imties galia</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.k} className={s.k === 1 ? "current-row" : ""}>
                    <td>{s.label}</td>
                    <td className="cell-num">{s.n === null ? "per daug" : fmtInt(s.n)}</td>
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
