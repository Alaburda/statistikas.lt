import { useEffect, useMemo, useRef, useState } from "react";
import { ABEL_SWITCH_CV, abelLimits, type AbelDesign } from "../engine/abel";
import type { AbelJob, AbelResult } from "../engine/abel.worker";
import {
  DESIGNS,
  EMA_MIN_SUBJECTS,
  cvUpper,
  dosed,
  powerTOST,
  sampleNTOST,
  tolerance,
  type BeInput,
  type DesignId,
} from "../engine/be";
import { fmtInt, fmtNum, fmtPct, fmtShort, parseNum } from "../format";
import { EN, L, PCT, plural } from "../i18n";
import { beReport } from "../report";
import { useForm } from "../url";
import { More, NumField, Notice, Peek, Segmented } from "./Fields";
import { PowerCurve } from "./PowerCurve";
import { ReportBlock, StatementBox } from "./ReportBlock";

const DEFAULTS = {
  solve: "n",
  method: "abe",
  design: "2x2",
  rep: "2x3x3",
  cv: "25",
  gmr: "95",
  limits: "std",
  power: "80",
  alpha: "0.05",
  drop: "10",
  n: "24",
  pilot: "",
};

const designLabel = (d: DesignId) => (EN ? DESIGNS[d].labelEn : DESIGNS[d].label);
const evaluableWord = (n: number) =>
  plural(n, ["vertinamas tiriamasis", "vertinami tiriamieji", "vertinamų tiriamųjų"], ["evaluable subject", "evaluable subjects"]);

const ORDER: DesignId[] = ["2x2", "parallel", "2x2x4", "2x2x3", "2x3x3", "2x4x4", "2x4x2", "2x2x2r", "3x3", "3x6x3", "4x4", "paired"];
const LIMITS = {
  std: [0.8, 1.25],
  nti: [0.9, 1 / 0.9],
} as const;

/** One long-lived worker; a newer job supersedes whatever is still running. */
function useAbel(job: Omit<AbelJob, "id"> | null) {
  const [result, setResult] = useState<AbelResult | null>(null);
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  const latest = useRef(0);
  const key = job ? JSON.stringify(job) : "";

  useEffect(() => {
    if (!key) return;
    setBusy(true);
    const timer = window.setTimeout(() => {
      // Terminating drops a stale simulation at once instead of letting it finish.
      worker.current?.terminate();
      const w = new Worker(new URL("../engine/abel.worker.ts", import.meta.url), { type: "module" });
      worker.current = w;
      const id = ++latest.current;
      w.onmessage = (e: MessageEvent<AbelResult>) => {
        if (e.data.id !== latest.current) return;
        setResult(e.data);
        setBusy(false);
      };
      w.postMessage({ ...(JSON.parse(key) as Omit<AbelJob, "id">), id });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [key]);

  useEffect(() => () => worker.current?.terminate(), []);
  return { result, busy };
}

export function BeTab({ active }: { active: boolean }) {
  const [form, set] = useForm("be", active, DEFAULTS);
  const abel = form.method === "abel";
  const solveN = form.solve === "n";
  const design = (abel ? form.rep : form.design) as DesignId;
  const cv = parseNum(form.cv) / 100;
  const theta0 = parseNum(form.gmr) / 100;
  const target = parseNum(form.power) / 100;
  const alpha = parseNum(form.alpha);
  const dropout = (parseNum(form.drop) || 0) / 100;
  const inputN = parseNum(form.n);
  const [theta1, theta2] = abel ? abelLimits(cv) : LIMITS[form.limits as keyof typeof LIMITS];
  const steps = DESIGNS[design].steps;

  const errors = {
    cv: cv > 0 && cv < 5 ? null : L("CV turi būti teigiamas.", "The CV must be positive."),
    gmr: !(theta0 > (abel ? 0.8 : theta1) && theta0 < (abel ? 1.25 : theta2))
      ? L(
          `Santykis turi būti griežtai tarp ${fmtShort((abel ? 0.8 : theta1) * 100)} ir ${fmtShort((abel ? 1.25 : theta2) * 100)} %.`,
          `The ratio must be strictly between ${fmtShort((abel ? 0.8 : theta1) * 100)} and ${fmtShort((abel ? 1.25 : theta2) * 100)}%.`,
        )
      : null,
    n: inputN >= 2 * steps ? null : L(`Įveskite bent ${2 * steps}.`, `Enter at least ${2 * steps}.`),
  };
  const ok = !errors.cv && !errors.gmr && (solveN || !errors.n) && alpha > 0 && alpha < 0.5 && dropout >= 0 && dropout < 1;
  const input: BeInput = { alpha, theta0, theta1, theta2, cv, design };

  const abe = useMemo(() => {
    if (!ok || abel) return null;
    if (solveN) return sampleNTOST(input, target);
    return { n: inputN, power: powerTOST(input, inputN) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, abel, solveN, cv, theta0, theta1, theta2, alpha, design, target, inputN]);

  const job = ok && abel ? { design: design as AbelDesign, cv, theta0, target, alpha, n: solveN ? null : inputN } : null;
  const { result: abelResult, busy } = useAbel(active ? job : null);
  const abelFresh = abel && abelResult !== null;

  const n = abel ? (abelFresh ? abelResult.n : null) : (abe?.n ?? null);
  const achieved = abel ? (abelFresh ? abelResult.power : NaN) : (abe?.power ?? NaN);
  const evaluable = n === null ? null : solveN ? Math.max(n, steps * Math.ceil(EMA_MIN_SUBJECTS / steps)) : n;
  const raisedToMinimum = solveN && n !== null && evaluable !== null && evaluable > n;
  const enrolled = evaluable === null ? null : dosed(evaluable, dropout, steps);

  const tol = useMemo(() => {
    if (!ok || abel || evaluable === null || !solveN) return null;
    return tolerance(input, evaluable, 0.7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, abel, evaluable, solveN, cv, theta0, theta1, theta2, alpha, design]);

  const curve = useMemo(() => {
    if (!ok || abel || evaluable === null) return null;
    const maxN = Math.max(evaluable * 2, 16);
    const min = 2 * steps;
    const all: number[] = [];
    const stride = Math.max(steps, steps * Math.round((maxN - min) / 60 / steps));
    for (let x = min; x <= maxN; x += stride) all.push(x);
    const other = theta0 === 1 ? 0.95 : 1;
    const worse = theta0 <= 1 ? Math.max(theta0 - 0.05, (theta1 + theta0) / 2) : Math.min(theta0 + 0.05, (theta2 + theta0) / 2);
    const lines = [
      { t: theta0, label: `GMR ${fmtShort(theta0 * 100)}${PCT}`, color: "#1F45A0" },
      { t: worse, label: `GMR ${fmtShort(worse * 100)}${PCT}`, color: "#C23B2A", dash: "7 5" },
      { t: other, label: `GMR ${fmtShort(other * 100)}${PCT}`, color: "#6B675F", dash: "2 4" },
    ];
    return {
      xs: all,
      series: lines.map((l) => ({ label: l.label, color: l.color, dash: l.dash, values: all.map((x) => powerTOST({ ...input, theta0: l.t }, x)) })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, abel, evaluable, steps, cv, theta0, theta1, theta2, alpha, design]);

  const grid = useMemo(() => {
    if (!ok || abel) return null;
    const cvs = [cv - 0.05, cv, cv + 0.05, cv + 0.1].filter((x) => x > 0.01);
    const gmrs = [0.9, 0.925, 0.95, 0.975, 1].filter((g) => g > theta1 + 0.001 && g < theta2 - 0.001);
    return { cvs, gmrs, cells: cvs.map((c) => gmrs.map((g) => sampleNTOST({ ...input, cv: c, theta0: g }, target)?.n ?? null)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, abel, cv, theta0, theta1, theta2, alpha, design, target]);

  const pilotN = parseNum(form.pilot);
  const pilotDf = pilotN > 2 ? DESIGNS[design].df(pilotN) : NaN;
  const safeCv = pilotDf >= 1 && ok ? cvUpper(cv, pilotDf, 0.2) : NaN;
  const safeN = Number.isFinite(safeCv) && !abel ? sampleNTOST({ ...input, cv: safeCv }, target)?.n : undefined;

  const report =
    ok && solveN && n !== null && evaluable !== null && enrolled !== null && Number.isFinite(achieved)
      ? beReport({ input, abel, target, n: evaluable, achieved: raisedToMinimum ? (abel ? achieved : powerTOST(input, evaluable)) : achieved, dropout, enrolled, sims: abelResult?.sims ?? 0 })
      : null;

  return (
    <>
      <div className="calc">
        <form className="inputs" onSubmit={(e) => e.preventDefault()}>
          <Segmented
            label={L("Ko ieškote?", "What do you need?")}
            value={form.solve as "n" | "power"}
            onChange={(solve) => set({ solve })}
            options={[
              { value: "n", label: L("Imties", "Sample size") },
              { value: "power", label: L("Turiu n: kokia galia?", "I have n: what power?") },
            ]}
          />
          <Segmented
            label={L("Vertinimas", "Assessment")}
            value={form.method as "abe" | "abel"}
            onChange={(method) => set({ method, gmr: method === "abel" ? "90" : "95" })}
            hint={
              abel
                ? L("EMA išplečiamos ribos didelio kintamumo vaistams. Galia simuliuojama.", "EMA expanding limits for highly variable drugs. Power is simulated.")
                : undefined
            }
            options={[
              { value: "abe", label: L("Vidutinis BE (TOST)", "Average BE (TOST)") },
              { value: "abel", label: "ABEL (EMA)" },
            ]}
          />
          <div className="field">
            <label htmlFor="be-design">{L("Tyrimo dizainas", "Study design")}</label>
            <div className="input-wrap">
              <select
                id="be-design"
                value={abel ? form.rep : form.design}
                onChange={(e) => set(abel ? { rep: e.target.value } : { design: e.target.value })}
              >
                {(abel ? (["2x3x3", "2x2x4", "2x2x3"] as DesignId[]) : ORDER).map((d) => (
                  <option key={d} value={d}>
                    {designLabel(d)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!solveN && <NumField label={L("Vertinamų tiriamųjų", "Evaluable subjects")} value={form.n} onChange={(n) => set({ n })} decimal={false} error={errors.n} />}
          <NumField
            label={design === "parallel" ? L("Bendras CV", "Total CV") : L("Intrasubjektinis CV", "Intra-subject CV")}
            hint={L("Iš ankstesnio tyrimo, pagal jautriausią parametrą (dažniausiai Cmax).", "From an earlier study, for the most variable parameter (usually Cmax).")}
            value={form.cv}
            onChange={(v) => set({ cv: v })}
            suffix="%"
            error={errors.cv}
          />
          <NumField
            label={L("Tikėtinas T/R santykis (GMR)", "Expected T/R ratio (GMR)")}
            hint={
              abel
                ? L("EMA simuliacijoms įprasta 90 %.", "90% is usual for EMA simulations.")
                : L("95 % yra įprasta atsargi prielaida; 100 % beveik visada per optimistiška.", "95% is the usual cautious assumption; 100% is almost always too optimistic.")
            }
            value={form.gmr}
            onChange={(gmr) => set({ gmr })}
            suffix="%"
            error={errors.gmr}
          />
          {!abel && (
            <Segmented
              label={L("Bioekvivalentiškumo ribos", "Acceptance limits")}
              value={form.limits as "std" | "nti"}
              onChange={(limits) => set({ limits, gmr: limits === "nti" && form.gmr === "95" ? "97.5" : form.gmr })}
              options={[
                { value: "std", label: `80–125${PCT}` },
                { value: "nti", label: L("90–111,11 % (siauras TI)", "90–111.11% (narrow TI)") },
              ]}
            />
          )}
          {solveN && (
            <Segmented
              label={L("Statistinė galia", "Statistical power")}
              value={form.power as "80" | "90"}
              onChange={(power) => set({ power })}
              options={[
                { value: "80", label: `80${PCT}` },
                { value: "90", label: `90${PCT}` },
              ]}
            />
          )}
          {solveN && <NumField label={L("Numatomas pasitraukimas", "Expected dropout")} value={form.drop} onChange={(drop) => set({ drop })} suffix="%" />}
          <More title={L("Daugiau nustatymų", "More settings")}>
            <NumField
              label={L("Reikšmingumo lygis α", "Significance level α")}
              hint={L("0,05 atitinka 90 % PI.", "0.05 corresponds to a 90% CI.")}
              value={form.alpha}
              onChange={(alpha) => set({ alpha })}
            />
            {!abel && (
              <NumField
                label={L("CV gautas tyrime su tiek tiriamųjų", "The CV came from a study with this many subjects")}
                hint={L("Mažo tyrimo CV nepatikimas. Parodysime atsargesnį variantą.", "The CV of a small study is unreliable. We will show a more cautious option.")}
                value={form.pilot}
                onChange={(pilot) => set({ pilot })}
                decimal={false}
                placeholder={L("neprivaloma", "optional")}
              />
            )}
          </More>
          {ok && evaluable !== null && (
            <Peek value={solveN ? fmtInt(evaluable) : fmtPct(achieved, 1)} label={solveN ? evaluableWord(evaluable) : L("galia", "power")} />
          )}
        </form>

        <div className="result" aria-live="polite">
          {!ok ? (
            <p className="result-empty">{L("Pataisykite pažymėtus laukus.", "Fix the marked fields.")}</p>
          ) : abel && !abelFresh ? (
            <p className="result-empty">{L("Simuliuojama…", "Simulating…")}</p>
          ) : solveN ? (
            evaluable !== null ? (
              <div className={busy && abel ? "stale" : ""}>
                <span className="eyebrow">{L("Rezultatas", "Result")}</span>
                <p className="big">{fmtInt(evaluable)}</p>
                <p className="big-unit">{evaluableWord(evaluable)}</p>
                <p className="result-brief">
                  {L(
                    `Jei tikrasis GMR ${fmtShort(theta0 * 100)} %, o CV ${fmtPct(cv)}, tyrimas bioekvivalentiškumą parodys `,
                    `If the true GMR is ${fmtShort(theta0 * 100)}% and the CV ${fmtPct(cv)}, the study will show bioequivalence with `,
                  )}
                  <b>{fmtPct(raisedToMinimum && !abel ? powerTOST(input, evaluable) : achieved)}</b> {L("tikimybe.", "probability.")}
                  {dropout > 0 && enrolled !== null && (
                    <>
                      {" "}
                      {L("Įtraukite", "Dose")} <b>{fmtInt(enrolled)}</b> {plural(enrolled, ["tiriamąjį", "tiriamuosius", "tiriamųjų"], ["subject", "subjects"])}
                      {L(`, nes ${fmtPct(dropout, 0)} pasitrauks.`, `, as ${fmtPct(dropout, 0)} will drop out.`)}
                    </>
                  )}
                </p>
                {abel && (
                  <p className="result-alt">
                    {L(
                      `Ribos su CV ${fmtPct(cv, 0)}: ${fmtShort(theta1 * 100)}–${fmtShort(theta2 * 100)} %. Taškinis įvertis turi likti 80–125 %.`,
                      `Limits at a CV of ${fmtPct(cv, 0)}: ${fmtShort(theta1 * 100)}–${fmtShort(theta2 * 100)}%. The point estimate must stay within 80–125%.`,
                    )}
                  </p>
                )}
                {raisedToMinimum && (
                  <Notice
                    kind="info"
                    title={L(
                      `Skaičiavimas davė ${fmtInt(n!)}, bet EMA reikalauja bent 12 vertinamų tiriamųjų.`,
                      `The calculation gave ${fmtInt(n!)}, but the EMA requires at least 12 evaluable subjects.`,
                    )}
                  />
                )}
                {!abel && cv > ABEL_SWITCH_CV && form.limits === "std" && (
                  <Notice kind="info" title={L("CV viršija 30 %.", "The CV exceeds 30%.")}>
                    {L(
                      "Jei tai referencinio vaisto kintamumas, replikatų dizainas su ABEL gali gerokai sumažinti imtį.",
                      "If this is the variability of the reference product, a replicate design with ABEL can cut the sample considerably.",
                    )}{" "}
                    <button type="button" className="link" onClick={() => set({ method: "abel", gmr: "90" })}>
                      {L("Perjungti į ABEL", "Switch to ABEL")}
                    </button>
                  </Notice>
                )}
                {report && <StatementBox statement={report.statement} />}
              </div>
            ) : (
              <Notice title={L("Tinkamos imties rasti nepavyko.", "No suitable sample size was found.")} />
            )
          ) : (
            <div className={busy && abel ? "stale" : ""}>
              <span className="eyebrow">{L("Galia", "Power")}</span>
              <p className="big">{fmtPct(achieved, 1)}</p>
              <p className="big-unit">
                {L("su", "with")} {fmtInt(inputN)}{" "}
                {plural(inputN, ["vertinamu tiriamuoju", "vertinamais tiriamaisiais", "vertinamų tiriamųjų"], ["evaluable subject", "evaluable subjects"])}
              </p>
              {inputN % steps !== 0 && (
                <p className="result-alt">
                  {L(
                    `Sekos nesubalansuotos: ${steps} sekos, ${fmtInt(inputN)} tiriamųjų.`,
                    `Unbalanced sequences: ${steps} sequences, ${fmtInt(inputN)} subjects.`,
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {tol && evaluable !== null && (
        <section className="block" aria-labelledby="tol-title">
          <h2 id="tol-title">{L("Kiek planas atlaiko?", "How much can the plan take?")}</h2>
          <p className="block-lead">
            {L(
              `Su ${fmtInt(evaluable)} vertinamais tiriamaisiais galia liks bent 70 %, jei kiekvienas dydis atskirai pakis ne daugiau nei taip:`,
              `With ${fmtInt(evaluable)} evaluable subjects, power stays at 70% or more as long as each quantity, on its own, moves no further than this:`,
            )}
          </p>
          <dl className="tolerance">
            <div>
              <dt>{L("CV iki", "CV up to")}</dt>
              <dd>{fmtPct(tol.cvMax)}</dd>
            </div>
            <div>
              <dt>GMR {theta0 <= 1 ? L("nuo", "down to") : L("iki", "up to")}</dt>
              <dd>{fmtPct(tol.gmrWorst)}</dd>
            </div>
            <div>
              <dt>{L("Vertinamų bent", "Evaluable, at least")}</dt>
              <dd>{fmtInt(tol.nMin)}</dd>
            </div>
          </dl>
        </section>
      )}

      {Number.isFinite(safeCv) && safeN !== undefined && (
        <Notice
          kind="info"
          title={L(
            `Atsargesnis variantas: viršutinė 80 % CV riba ${fmtPct(safeCv)}, tada reikėtų ${fmtInt(safeN)} tiriamųjų.`,
            `A more cautious option: the upper 80% CV limit is ${fmtPct(safeCv)}, which would need ${fmtInt(safeN)} subjects.`,
          )}
        />
      )}

      {grid && (
        <section className="block" aria-labelledby="grid-title">
          <h2 id="grid-title">{L("Kas, jeigu CV ar GMR kitokie?", "What if the CV or GMR were different?")}</h2>
          <p className="block-lead">
            {L(
              `Vertinamų tiriamųjų skaičius, ${designLabel(design)}, galia ${fmtPct(target, 0)}.`,
              `Evaluable subjects, ${designLabel(design)}, ${fmtPct(target, 0)} power.`,
            )}
          </p>
          <div className="table-scroll">
            <table className="scenarios">
              <thead>
                <tr>
                  <th>CV / GMR</th>
                  {grid.gmrs.map((g) => (
                    <th key={g} className="cell-num">
                      {fmtPct(g, 1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.cvs.map((c, i) => (
                  <tr key={c}>
                    <td>{fmtPct(c, 1)}</td>
                    {grid.cells[i].map((v, j) => (
                      <td key={j} className={`cell-num ${Math.abs(c - cv) < 1e-9 && Math.abs(grid.gmrs[j] - theta0) < 1e-9 ? "current" : ""}`}>
                        {v === null ? "–" : fmtInt(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {abel && abelFresh && abelResult.scenarios.length > 0 && (
        <section className={`block ${busy ? "stale" : ""}`} aria-labelledby="abel-title">
          <h2 id="abel-title">{L("Kas, jeigu CV ar GMR kitokie?", "What if the CV or GMR were different?")}</h2>
          <p className="block-lead">
            {L(
              `Vertinamų tiriamųjų skaičius, ${designLabel(design)}, simuliacija. Imtis nebūtinai didėja kartu su CV: kol CV mažesnis už 50 %, ribos plečiasi kartu su juo.`,
              `Evaluable subjects, ${designLabel(design)}, simulated. The sample need not grow with the CV: below a CV of 50%, the limits widen with it.`,
            )}
          </p>
          <div className="table-scroll">
            <table className="scenarios">
              <thead>
                <tr>
                  <th>CV</th>
                  <th className="cell-num">GMR 90{PCT}</th>
                  <th className="cell-num">GMR 95{PCT}</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(new Set(abelResult.scenarios.map((s) => s.cv))).map((c) => (
                  <tr key={c}>
                    <td>{fmtPct(c, 1)}</td>
                    {[0.9, 0.95].map((g) => {
                      const cell = abelResult.scenarios.find((s) => s.cv === c && s.theta0 === g);
                      return (
                        <td key={g} className="cell-num">
                          {cell?.n == null ? "–" : fmtInt(cell.n)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {curve && evaluable !== null && (
        <section className="block" aria-labelledby="becurve-title">
          <h2 id="becurve-title">{L("Kaip galia priklauso nuo imties", "How power depends on sample size")}</h2>
          <PowerCurve
            xs={curve.xs}
            series={curve.series}
            target={target}
            mark={evaluable}
            xTitle={L("Vertinamų tiriamųjų", "Evaluable subjects")}
            ariaLabel={L(
              `TOST galia pagal imties dydį trims GMR reikšmėms. Su ${evaluable} tiriamųjų galia ${fmtNum(achieved * 100, 1)} procento.`,
              `TOST power by sample size for three GMR values. With ${evaluable} subjects, power is ${fmtNum(achieved * 100, 1)} per cent.`,
            )}
          />
        </section>
      )}

      {report && <ReportBlock report={report} />}
    </>
  );
}
