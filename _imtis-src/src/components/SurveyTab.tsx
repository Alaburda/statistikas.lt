import {
  allocate,
  cochranN,
  designEffect,
  estimateMargin,
  estimateN,
  invitations,
  jointConfidence,
  nonresponseBounds,
  paniottoN,
  plannedShare,
  wilson,
  type Estimate,
  type EstimateContext,
  type Stratum,
} from "../engine/survey";
import { fmtInt, fmtPct, fmtShort, parseNum } from "../format";
import { L, PCT, plural } from "../i18n";
import { achievedReport, surveyReport } from "../report";
import { useForm } from "../url";
import { Check, More, NumField, Notice, Peek, Segmented, SliderField } from "./Fields";
import { ReportBlock, StatementBox } from "./ReportBlock";

const DEFAULTS = {
  mode: "need",
  N: "1200",
  e: "5",
  got: "180",
  conf: "95",
  p: "50",
  pn: "",
  px: "",
  rr: "40",
  formula: "cochran",
  measure: "share",
  sd: "15",
  em: "2",
  cl: "",
  icc: "",
  q: "",
  more: "",
  joint: "0",
  groups: "",
  each: "0",
};
type Form = typeof DEFAULTS;

const answersWord = (n: number) =>
  plural(n, ["užpildyta anketa", "užpildytos anketos", "užpildytų anketų"], ["completed questionnaire", "completed questionnaires"]);
const invitesWord = (n: number) => plural(n, ["kvietimą", "kvietimus", "kvietimų"], ["invitation", "invitations"]);
const MARGINS = [0.03, 0.04, 0.05, 0.07, 0.1];
const MAIN_NAME = L("Pagrindinis rodiklis", "Main estimate");
const estimateName = (i: number) => `${L("Rodiklis", "Estimate")} ${i}`;
const PILOT_LEVEL = 0.95;

/** Groups are kept in one URL field: "Vidaus ligos:420|Chirurgija:380". */
function parseGroups(s: string): Stratum[] {
  if (!s) return [];
  return s.split("|").map((part) => {
    const [name, size] = part.split(":");
    return { name, size: parseNum(size ?? "") || 0 };
  });
}
const serializeGroups = (g: Stratum[]) => g.map((x) => `${x.name.replace(/[|:]/g, " ")}:${x.size || ""}`).join("|");

const EXAMPLE_GROUPS: Stratum[] = [
  { name: L("Vidaus ligos", "Internal medicine"), size: 420 },
  { name: L("Chirurgija", "Surgery"), size: 380 },
  { name: L("Intensyvioji terapija", "Intensive care"), size: 250 },
  { name: L("Kiti skyriai", "Other wards"), size: 150 },
];

/** A key estimate as typed: raw strings, like every other input. */
interface Row {
  name: string;
  kind: Estimate["kind"];
  value: string;
  margin: string;
}

/** Further key estimates, in one URL field: "Traumos:s:10:2|Balas:m:15:2". */
function parseRows(s: string): Row[] {
  if (!s) return [];
  return s.split("|").map((part) => {
    const [name, kind, value, margin] = part.split(":");
    return { name, kind: kind === "m" ? "mean" : "share", value: value ?? "", margin: margin ?? "" };
  });
}
const serializeRows = (rows: Row[]) =>
  rows.map((r) => `${r.name.replace(/[|:]/g, " ")}:${r.kind === "mean" ? "m" : "s"}:${r.value}:${r.margin}`).join("|");

const ROW_DEFAULTS: Record<Row["kind"], Pick<Row, "value" | "margin">> = {
  share: { value: "50", margin: "5" },
  mean: { value: "15", margin: "2" },
};

function toEstimate(r: Row): Estimate {
  const scale = r.kind === "share" ? 100 : 1;
  return { name: r.name, kind: r.kind, value: parseNum(r.value) / scale, margin: parseNum(r.margin) / scale };
}

function isUsable(e: Estimate, need: boolean): boolean {
  const value = e.kind === "share" ? e.value > 0 && e.value < 1 : e.value > 0;
  const margin = e.kind === "share" ? e.margin > 0 && e.margin < 1 : e.margin > 0;
  return value && (margin || !need);
}

const marginLabel = (e: Estimate, m: number) => (e.kind === "share" ? `±${fmtPct(m)}` : `±${fmtShort(m, 3)}`);

/** Whole percent, rounded towards 50 so that rounding never shrinks the sample. */
function plannedPercent(x: number, n: number): number {
  const v = plannedShare(x, n, PILOT_LEVEL) * 100;
  return v < 50 ? Math.ceil(v) : Math.floor(v);
}

/** Turns a small pilot into a share that is safe to plan with. */
function ShareFinder({ form, set }: { form: Form; set: (p: Partial<Form>) => void }) {
  const n = parseNum(form.pn);
  const x = parseNum(form.px);
  const valid = n >= 2 && x >= 0 && x <= n;
  const plan = valid ? plannedPercent(x, n) : NaN;
  const [lo, hi] = valid ? wilson(x, n, PILOT_LEVEL) : [NaN, NaN];
  return (
    <More title={L("Nežinote tikėtinos dalies?", "Don't know the expected proportion?")} open={form.pn !== ""}>
      <p className="hint">
        {L(
          "Paimkite ją iš ankstesnės apklausos ar panašaus tyrimo. Jei tokių nėra, apklauskite 20–30 žmonių ir įveskite rezultatą. Nieko neturite? Palikite 50 %: imtis bus didžiausia, bet tikrai pakankama.",
          "Take it from an earlier survey or a similar study. If there is none, ask 20–30 people and enter the result. Nothing at all? Leave 50%: the sample will be the largest, but certainly enough.",
        )}
      </p>
      <NumField label={L("Kiek žmonių atsakė bandomojoje apklausoje?", "How many people answered the pilot survey?")} value={form.pn} onChange={(pn) => set({ pn })} decimal={false} />
      <NumField label={L("Kiek iš jų atsakė „taip“?", "How many of them said “yes”?")} value={form.px} onChange={(px) => set({ px })} decimal={false} />
      {valid && (
        <p className="sd-result">
          {L("Atsakė", "Yes:")} {fmtPct(x / n, 0)} (95{PCT} {L("PI", "CI")} {fmtShort(lo * 100, 0)}–{fmtPct(hi, 0)}).{" "}
          {plan === 50
            ? L("Tokia apklausa 50 % neatmeta.", "A pilot like this does not rule out 50%.")
            : L("Planuokite su PI riba, artimiausia 50 %.", "Plan with the CI limit nearest 50%.")}{" "}
          <button type="button" onClick={() => set({ p: String(plan) })}>
            {L("Naudoti", "Use")} {plan}
            {PCT}
          </button>
        </p>
      )}
    </More>
  );
}

export function SurveyTab({ active }: { active: boolean }) {
  const [form, set] = useForm("apklausa", active, DEFAULTS);
  const groups = parseGroups(form.groups);
  const rows = parseRows(form.more);
  const usesGroups = groups.length > 0;
  const need = form.mode === "need";

  const population = usesGroups
    ? groups.reduce((s, g) => s + g.size, 0) || null
    : form.N.trim() === ""
      ? null
      : parseNum(form.N);
  const confidence = parseNum(form.conf) / 100;
  const rr = parseNum(form.rr) / 100;
  const isMean = form.measure === "mean";
  const paniotto = need && form.formula === "paniotto" && !isMean;
  const clusterSize = parseNum(form.cl);
  const icc = parseNum(form.icc);
  const deff = clusterSize > 1 && icc >= 0 ? designEffect(clusterSize, icc) : 1;

  const mainRow: Row = {
    name: form.q || MAIN_NAME,
    kind: isMean ? "mean" : "share",
    value: isMean ? form.sd : form.p,
    margin: isMean ? form.em : form.e,
  };
  // Paniotto's formula has no share to set: it is always 50 %.
  const main = { ...toEstimate(mainRow), ...(paniotto ? { value: 0.5 } : {}) };
  const p = main.value;
  const margin = main.margin;
  const sd = main.value;

  const errors = {
    N: population !== null && !(population >= 2) ? L("Įveskite bent 2 arba palikite tuščią.", "Enter at least 2 or leave it empty.") : null,
    e: need && !isMean && !(margin > 0 && margin < 1) ? L("Paklaida turi būti tarp 0 ir 100 %.", "The margin must be between 0 and 100%.") : null,
    p: !isMean && !(p > 0 && p < 1) ? L("Dalis turi būti tarp 0 ir 100 %.", "The proportion must be between 0 and 100%.") : null,
    rr: !(rr > 0 && rr <= 1) ? L("Atsakas turi būti nuo 1 iki 100 %.", "The response rate must be 1–100%.") : null,
    got: !need && !(parseNum(form.got) >= 1) ? L("Įveskite atsakymų skaičių.", "Enter the number of responses.") : null,
    em: need && isMean && !(margin > 0) ? L("Įveskite paklaidą.", "Enter the margin of error.") : null,
    sd: isMean && !(sd > 0) ? L("Įveskite standartinį nuokrypį.", "Enter the standard deviation.") : null,
  };
  const ok = !Object.values(errors).some(Boolean);

  const extras = rows.map(toEstimate);
  const all = [main, ...extras.filter((e) => isUsable(e, need))];
  const k = all.length;
  const joint = form.joint === "1" && k > 1 && !paniotto;
  const level = joint ? jointConfidence(confidence, k) : confidence;
  const ctx: EstimateContext = { population, confidence: level, deff, formula: paniotto ? "paniotto" : "cochran" };

  const sizes = ok ? all.map((e) => estimateN(e, ctx)) : [];
  const requiredFor = (pop: number) => Math.max(...all.map((e) => estimateN(e, { ...ctx, population: pop })));
  const n = ok ? Math.max(...sizes) : 0;
  const driver = all[sizes.indexOf(n)];
  const sizeFor = (m: number) => estimateN({ ...main, margin: m }, ctx);

  const alt = ok && !isMean && k === 1 ? (paniotto ? cochranN({ population, confidence, p: 0.5, deff, margin }) : paniottoN(margin, population, deff)) : null;
  const got = Math.min(parseNum(form.got), population ?? Infinity);
  const marginAt = (answers: number) => estimateMargin(main, answers, ctx);
  const shareLabel = (m: number) => marginLabel(main, m);
  const bounds = ok && !isMean ? nonresponseBounds(p, rr) : null;

  const allocation =
    ok && usesGroups ? (form.each === "1" ? groups.map((g) => (g.size > 0 ? requiredFor(g.size) : 0)) : allocate(groups, n)) : null;
  const allocationTotal = allocation?.reduce((a, b) => a + b, 0) ?? 0;
  const perGroup = usesGroups && form.each === "1" && allocationTotal > 0;
  const answers = perGroup ? allocationTotal : n;
  const reach = ok ? invitations(answers, rr, population) : null;

  const pilotN = parseNum(form.pn);
  const pilotX = parseNum(form.px);
  const pilotUsed = need && !isMean && !paniotto && pilotN >= 2 && pilotX >= 0 && pilotX <= pilotN && parseNum(form.p) === plannedPercent(pilotX, pilotN);
  const nominal = { confidence, joint: joint ? k : null };

  const report = !ok
    ? null
    : !need
      ? achievedReport({
          ...nominal,
          population,
          got,
          level,
          deff,
          responseRate: rr,
          estimates: all.map((e) => ({ ...e, reached: estimateMargin(e, got, ctx) })),
        })
      : reach
        ? surveyReport({
            ...nominal,
            formula: paniotto ? "paniotto" : "cochran",
            measure: isMean ? "mean" : "share",
            population,
            margin,
            p,
            sd,
            deff,
            clusterSize: clusterSize > 1 ? clusterSize : null,
            icc: icc >= 0 ? icc : null,
            n: answers,
            strata: usesGroups ? { sizes: groups.map((g) => g.size), ns: allocation ?? [], each: perGroup } : undefined,
            estimates: k > 1 ? all.map((e, i) => ({ ...e, n: sizes[i] })) : undefined,
            pilot: pilotUsed ? { x: pilotX, n: pilotN, low: wilson(pilotX, pilotN, PILOT_LEVEL)[0], high: wilson(pilotX, pilotN, PILOT_LEVEL)[1] } : null,
            responseRate: rr,
            send: reach.send,
            possible: reach.possible,
            expectedAnswers: reach.expectedAnswers,
          })
        : null;

  function setGroup(i: number, patch: Partial<Stratum>) {
    set({ groups: serializeGroups(groups.map((g, j) => (j === i ? { ...g, ...patch } : g))) });
  }

  /** Row 0 of the table is the estimate in the main form, so both edit the same fields. */
  function setRow(i: number, patch: Partial<Row>) {
    if (i === 0) {
      if (patch.name !== undefined) set({ q: patch.name });
      if (patch.kind) set({ measure: patch.kind, formula: "cochran" });
      if (patch.value !== undefined) set(isMean ? { sd: patch.value } : { p: patch.value });
      if (patch.margin !== undefined) set(isMean ? { em: patch.margin } : { e: patch.margin });
      return;
    }
    const next = patch.kind ? { ...patch, ...ROW_DEFAULTS[patch.kind] } : patch;
    set({ more: serializeRows(rows.map((r, j) => (j === i - 1 ? { ...r, ...next } : r))) });
  }

  return (
    <>
      <div className="calc">
        <form className="inputs" onSubmit={(e) => e.preventDefault()}>
          <Segmented
            label={L("Ko ieškote?", "What do you need?")}
            value={form.mode as "need" | "have"}
            onChange={(mode) => set({ mode })}
            options={[
              { value: "need", label: L("Kiek žmonių apklausti", "How many to survey") },
              { value: "have", label: L("Jau padariau apklausą", "My survey is done") },
            ]}
          />
          {!usesGroups && (
            <NumField
              label={L("Kiek žmonių yra tiriamojoje grupėje?", "How many people are in the population?")}
              hint={L(
                "Pvz., visos ligoninės slaugytojos. Jei jų labai daug ar skaičius nežinomas, palikite tuščią.",
                "For example, all nurses of a hospital. If there are very many or the number is unknown, leave it empty.",
              )}
              value={form.N}
              onChange={(N) => set({ N })}
              placeholder={L("labai daug", "very many")}
              decimal={false}
              error={errors.N}
            />
          )}
          {!need && <NumField label={L("Kiek atsakymų gavote?", "How many responses did you get?")} value={form.got} onChange={(got) => set({ got })} decimal={false} error={errors.got} />}
          <Segmented
            label={need ? L("Ką vertinsite?", "What will you estimate?") : L("Ką vertinote?", "What did you estimate?")}
            value={form.measure as "share" | "mean"}
            onChange={(measure) => set({ measure, formula: "cochran" })}
            options={[
              { value: "share", label: L("Dalį (taip / ne)", "A proportion (yes / no)") },
              { value: "mean", label: L("Vidurkį (balą)", "A mean (score)") },
            ]}
          />
          {need && !isMean && (
            <NumField
              label={L("Leistina paklaida", "Margin of error")}
              hint={L(
                "Jei 40 % atsakė „taip“, ±5 % reiškia: tikroji dalis tarp 35 ir 45 %.",
                "If 40% say “yes”, ±5% means the true proportion is between 35 and 45%.",
              )}
              value={form.e}
              onChange={(e) => set({ e })}
              suffix="± %"
              error={errors.e}
            />
          )}
          {need && !isMean && (
            <Segmented
              label={L("Formulė", "Formula")}
              hint={
                paniotto
                  ? L(
                      "Lietuvos darbuose dažniausia. Ji tokia pati kaip Yamane formulė: visada laiko, kad patikimumas apie 95 % ir dalis 50 %, todėl jų keisti negalima.",
                      "n = N / (1 + Ne²), common in theses (in Lithuania it is called Paniotto's formula). It always assumes about 95% confidence and a 50% proportion, so neither can be changed.",
                    )
                  : L(
                      "Tarptautinis standartas: galima keisti patikimumą ir tikėtiną dalį.",
                      "The international standard: the confidence level and the expected proportion can be changed.",
                    )
              }
              value={form.formula as "cochran" | "paniotto"}
              onChange={(formula) => set({ formula })}
              options={[
                { value: "cochran", label: "Cochran" },
                { value: "paniotto", label: L("Paniotto", "Yamane") },
              ]}
            />
          )}
          {!isMean && !paniotto && (
            <>
              <NumField
                label={need ? L("Kokia dalis tikriausiai atsakys „taip“?", "What share will probably say “yes”?") : L("Kokia dalis atsakė „taip“?", "What share said “yes”?")}
                hint={need ? L("Kuo arčiau 50 %, tuo didesnės imties reikia.", "The closer to 50%, the larger the sample.") : undefined}
                value={form.p}
                onChange={(p) => set({ p })}
                suffix="%"
                error={errors.p}
              />
              {need && <ShareFinder form={form} set={set} />}
            </>
          )}
          {isMean && (
            <>
              <NumField
                label={L("Standartinis nuokrypis", "Standard deviation")}
                hint={need ? L("Numatomas, iš ankstesnio tyrimo.", "Expected, from an earlier study.") : undefined}
                value={form.sd}
                onChange={(sd) => set({ sd })}
                error={errors.sd}
              />
              {need && <NumField label={L("Leistina paklaida, vienetais", "Margin of error, in units")} hint={L("Pvz., ±2 balai.", "For example, ±2 points.")} value={form.em} onChange={(em) => set({ em })} suffix="±" error={errors.em} />}
            </>
          )}
          {!paniotto && (
            <Segmented
              label={L("Patikimumo lygis", "Confidence level")}
              value={form.conf as "90" | "95" | "99"}
              onChange={(conf) => set({ conf })}
              options={[
                { value: "90", label: `90${PCT}` },
                { value: "95", label: `95${PCT}` },
                { value: "99", label: `99${PCT}` },
              ]}
            />
          )}
          <SliderField
            label={need ? L("Kokia dalis pakviestųjų atsakys?", "What share of those invited will respond?") : L("Kokia dalis pakviestųjų atsakė?", "What share of those invited responded?")}
            hint={
              need
                ? L("Vidinėse apklausose dažnai 30–60 %, atvirose internetinėse daug mažiau.", "Often 30–60% in internal surveys, far less in open online ones.")
                : undefined
            }
            value={form.rr}
            onChange={(rr) => set({ rr })}
            error={errors.rr}
          />

          <More title={L("Daugiau nustatymų", "More settings")}>
            <NumField
              label={L("Žmonių viename klasteryje", "People per cluster")}
              hint={L(
                "Jei renkate ne po vieną žmogų, o ištisus skyrius ar klases. Kitaip palikite tuščią.",
                "If you sample whole wards or classes rather than one person at a time. Otherwise leave it empty.",
              )}
              value={form.cl}
              onChange={(cl) => set({ cl })}
              decimal={false}
            />
            {clusterSize > 1 && (
              <NumField
                label={L("Vidinė klasterio koreliacija (ICC)", "Intra-cluster correlation (ICC)")}
                hint={L(`Dažnai 0,01–0,05. Dizaino efektas: ${fmtShort(deff)}.`, `Often 0.01–0.05. Design effect: ${fmtShort(deff)}.`)}
                value={form.icc}
                onChange={(icc) => set({ icc })}
              />
            )}
          </More>
          {ok && <Peek value={need ? fmtInt(answers) : shareLabel(marginAt(got))} label={need ? answersWord(answers) : L("paklaida", "margin of error")} />}
        </form>

        <div className="result" aria-live="polite">
          {!ok ? (
            <p className="result-empty">{L("Pataisykite pažymėtus laukus.", "Fix the marked fields.")}</p>
          ) : need ? (
            <>
              <span className="eyebrow">{L("Rezultatas", "Result")}</span>
              <p className="big">{fmtInt(answers)}</p>
              <p className="big-unit">
                {answersWord(answers)}
                {perGroup ? L(` iš viso, ${groups.length} grupėse`, ` in total, across ${groups.length} groups`) : ""}
              </p>
              <p className="result-brief">
                {perGroup
                  ? L(
                      `Tiek reikia, kad kiekvienos iš ${groups.length} grupių rezultatą būtų galima vertinti atskirai.`,
                      `That is what it takes to read each of the ${groups.length} groups on its own.`,
                    )
                  : k > 1
                    ? L(
                        `Tiek reikia, kad visi ${k} rodikliai pasiektų norimą tikslumą; daugiausia reikalauja „${driver.name}“.`,
                        `That is what it takes for all ${k} estimates to reach their precision; “${driver.name}” needs the most.`,
                      )
                    : L(
                        `Tada ${paniotto ? "apie 95 %" : fmtPct(level, 0)} patikimumu tikr${isMean ? "asis vidurkis" : "oji dalis"} nuo apklausos rezultato skirsis ne daugiau kaip ${shareLabel(margin)}.`,
                        `Then, with ${paniotto ? "about 95%" : fmtPct(level, 0)} confidence, the true ${isMean ? "mean" : "proportion"} is within ${shareLabel(margin)} of the survey result.`,
                      )}
                {reach && (
                  <>
                    {" "}
                    {L("Išsiųskite", "Send")} <b>{fmtInt(reach.send)}</b> {invitesWord(reach.send)}
                    {reach.possible
                      ? L(`, nes atsakys apie ${fmtPct(rr, 0)}.`, `, as about ${fmtPct(rr, 0)} will respond.`)
                      : L(` – tai visi grupės nariai.`, `: that is everyone in the population.`)}
                  </>
                )}
              </p>
              {alt !== null && !perGroup && (
                <p className="result-alt">
                  {paniotto ? L("Pagal Cochran formulę", "With Cochran's formula") : L("Pagal Paniotto formulę", "With Yamane's formula")}: {fmtInt(alt)}
                  {!paniotto && Math.abs(p - 0.5) > 1e-9 ? L(" (ji visada laiko dalį 50 %)", " (it always assumes 50%)") : ""}
                </p>
              )}
              {deff > 1 && <p className="result-alt">{L("Įskaičiuotas dizaino efektas", "Includes a design effect of")} {fmtShort(deff)}.</p>}
              {reach && !reach.possible && (
                <Notice title={L("Tokio tikslumo pasiekti nepavyks.", "This precision is out of reach.")}>
                  {L(
                    `Net pakvietus visus ${fmtInt(population!)}, atsakys apie ${fmtInt(reach.expectedAnswers)}${perGroup || k > 1 ? "" : `, o paklaida bus ${shareLabel(marginAt(reach.expectedAnswers))}`}. Reikia didesnio atsako arba kuklesnio tikslumo.`,
                    `Even if all ${fmtInt(population!)} are invited, about ${fmtInt(reach.expectedAnswers)} will respond${perGroup || k > 1 ? "" : `, for a margin of ${shareLabel(marginAt(reach.expectedAnswers))}`}. You need a higher response rate or a less ambitious margin.`,
                  )}
                </Notice>
              )}
              {report && <StatementBox statement={report.statement} />}
            </>
          ) : (
            <>
              <span className="eyebrow">{L("Jūsų paklaida", "Your margin of error")}</span>
              <p className="big">{shareLabel(marginAt(got))}</p>
              <p className="big-unit">
                {L("su", "with")} {fmtInt(got)} {plural(got, ["atsakymu", "atsakymais", "atsakymų"], ["response", "responses"])}
                {population ? L(` iš ${fmtInt(population)}`, ` of ${fmtInt(population)}`) : ""}, {fmtPct(level, joint ? 2 : 0)} {L("patikimumas", "confidence")}
              </p>
              <p className="result-brief">
                {isMean ? (
                  <>
                    {L("Tikrasis vidurkis tikriausiai nuo gauto skiriasi ne daugiau kaip", "The true mean is probably within")} {shareLabel(marginAt(got))}
                    {L("", " of yours")}.
                  </>
                ) : (
                  <>
                    {L(`Kadangi „taip“ atsakė ${fmtPct(p, 0)}, tikroji dalis tikriausiai tarp`, `As ${fmtPct(p, 0)} said “yes”, the true proportion is probably between`)}{" "}
                    <b>
                      {fmtPct(Math.max(p - marginAt(got), 0), 1)} {L("ir", "and")} {fmtPct(Math.min(p + marginAt(got), 1), 1)}
                    </b>
                    .
                  </>
                )}
              </p>
              {deff > 1 && <p className="result-alt">{L("Įskaičiuotas dizaino efektas", "Includes a design effect of")} {fmtShort(deff)}.</p>}
              {population !== null && (
                <p className="result-alt">
                  {L(
                    `Atsakė ${fmtPct(got / population, 0)} grupės. Ši paklaida laiko, kad atsakiusieji nesiskiria nuo neatsakiusiųjų.`,
                    `${fmtPct(got / population, 0)} of the population responded. This margin assumes that respondents do not differ from non-respondents.`,
                  )}
                </p>
              )}
              {report && <StatementBox statement={report.statement} />}
            </>
          )}
        </div>
      </div>

      <section className="block" aria-labelledby="keys-title">
        <h2 id="keys-title">{L("Keli pagrindiniai rodikliai", "Several key estimates")}</h2>
        {rows.length === 0 ? (
          <>
            <p className="block-lead">
              {L(
                "Anketoje dažnai svarbūs keli skaičiai, ir jiems reikia skirtingo tikslumo. Apskaičiuokite kiekvieną atskirai: imtį lemia reikliausias rodiklis.",
                "A questionnaire often has several numbers that matter, each needing its own precision. Size each one: the most demanding decides the sample.",
              )}
            </p>
            <button type="button" onClick={() => set({ more: serializeRows([{ name: estimateName(2), kind: "share", ...ROW_DEFAULTS.share }]) })}>
              {L("Pridėti rodiklį", "Add an estimate")}
            </button>
          </>
        ) : (
          <>
            <div className="table-scroll">
              <table className="groups keys">
                <thead>
                  <tr>
                    <th>{L("Rodiklis", "Estimate")}</th>
                    <th>{L("Tipas", "Type")}</th>
                    <th className="cell-num">{L("Dalis, % arba SD", "Proportion, % or SD")}</th>
                    {need && <th className="cell-num">{L("Paklaida ±", "Margin ±")}</th>}
                    <th className="cell-num">{need ? L("Reikia atsakymų", "Responses needed") : L("Paklaida", "Margin")}</th>
                    <th aria-label={L("Veiksmai", "Actions")} />
                  </tr>
                </thead>
                <tbody>
                  {[mainRow, ...rows].map((r, i) => {
                    const e = i === 0 ? main : extras[i - 1];
                    const usable = isUsable(e, need);
                    const size = usable && need ? estimateN(e, ctx) : 0;
                    const lockedShare = paniotto && r.kind === "share";
                    return (
                      <tr key={i}>
                        <td>
                          <input
                            aria-label={L("Rodiklio pavadinimas", "Estimate name")}
                            placeholder={i === 0 ? MAIN_NAME : undefined}
                            value={i === 0 ? form.q : r.name}
                            onChange={(ev) => setRow(i, { name: ev.target.value })}
                          />
                        </td>
                        <td data-label={L("Tipas", "Type")}>
                          <select aria-label={`${r.name}: ${L("tipas", "type")}`} value={r.kind} onChange={(ev) => setRow(i, { kind: ev.target.value as Row["kind"] })}>
                            <option value="share">{L("Dalis", "Proportion")}</option>
                            <option value="mean">{L("Vidurkis", "Mean")}</option>
                          </select>
                        </td>
                        <td
                          className="cell-num"
                          data-label={r.kind === "share" ? (need ? L("Tikėtina dalis, %", "Expected proportion, %") : L("Dalis, %", "Proportion, %")) : "SD"}
                        >
                          <input
                            aria-label={`${r.name}: ${r.kind === "share" ? L("tikėtina dalis, %", "expected proportion, %") : L("standartinis nuokrypis", "standard deviation")}`}
                            inputMode="decimal"
                            className="num"
                            disabled={lockedShare}
                            value={lockedShare ? "50" : r.value}
                            onChange={(ev) => setRow(i, { value: ev.target.value })}
                          />
                        </td>
                        {need && (
                          <td className="cell-num" data-label={L("Paklaida ±", "Margin ±")}>
                            <input
                              aria-label={`${r.name}: ${L("paklaida", "margin")}`}
                              inputMode="decimal"
                              className="num"
                              value={r.margin}
                              onChange={(ev) => setRow(i, { margin: ev.target.value })}
                            />
                          </td>
                        )}
                        <td className={`cell-num ${need && usable && e === driver ? "current" : ""}`} data-label={need ? L("Reikia atsakymų", "Responses needed") : L("Paklaida", "Margin")}>
                          {!usable ? "–" : need ? fmtInt(size) : ok ? marginLabel(e, estimateMargin(e, got, ctx)) : "–"}
                        </td>
                        <td>
                          {i > 0 && (
                            <button
                              type="button"
                              className="row-x"
                              aria-label={`${L("Pašalinti", "Remove")} ${r.name}`}
                              title={L("Pašalinti", "Remove")}
                              onClick={() => set({ more: serializeRows(rows.filter((_, j) => j !== i - 1)) })}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row-actions">
              <button
                type="button"
                onClick={() => set({ more: serializeRows([...rows, { name: estimateName(rows.length + 2), kind: "share", ...ROW_DEFAULTS.share }]) })}
              >
                {L("+ Rodiklis", "+ Estimate")}
              </button>
              <button type="button" onClick={() => set({ more: "", joint: "0" })}>
                {L("Vienas rodiklis", "One estimate")}
              </button>
            </div>
            {paniotto ? (
              <p className="block-lead">
                {L(
                  "Paniotto formulė visada laiko dalį 50 %, todėl dalims lemia tik paklaida, o vidurkiai skaičiuojami pagal Cochran. Norėdami įvertinti tikėtinas dalis ar taikyti Bonferroni pataisą, rinkitės Cochran.",
                  "Yamane's formula always assumes a 50% proportion, so for proportions only the margin matters, and means are sized with Cochran's. To use expected proportions or a Bonferroni correction, choose Cochran.",
                )}
              </p>
            ) : (
              <Check
                label={L(
                  `Noriu, kad visi ${k} rodikliai kartu tilptų į paklaidas (Bonferroni pataisa${joint ? `: kiekvienam ${fmtPct(level, 2)} patikimumas` : ""})`,
                  `All ${k} estimates should be within their margins at once (Bonferroni correction${joint ? `: ${fmtPct(level, 2)} confidence for each` : ""})`,
                )}
                checked={form.joint === "1"}
                onChange={(v) => set({ joint: v ? "1" : "0" })}
              />
            )}
          </>
        )}
      </section>

      {(need || usesGroups) && (
        <section className="block" aria-labelledby="groups-title">
          <h2 id="groups-title">{L("Paskirstymas pagal grupes", "Allocation across groups")}</h2>
          {!usesGroups ? (
            <>
              <p className="block-lead">
                {L(
                  "Skyriai, regionai ar amžiaus grupės skiriasi? Reprezentatyvumą paprasčiausia užtikrinti atrenkant iš kiekvienos grupės proporcingai jos dydžiui.",
                  "Do wards, regions or age groups differ? The simplest way to keep the sample representative is to draw from each group in proportion to its size.",
                )}
              </p>
              <button type="button" onClick={() => set({ groups: serializeGroups(EXAMPLE_GROUPS) })}>
                {L("Pridėti grupes", "Add groups")}
              </button>
            </>
          ) : (
            <>
              <Check
                label={
                  k > 1
                    ? L("Noriu tokio tikslumo kiekvienoje grupėje, nes jas lyginsiu", "I want this precision in every group, because I will compare them")
                    : L(
                        `Noriu ${shareLabel(margin)} paklaidos kiekvienoje grupėje, nes jas lyginsiu`,
                        `I want a ${shareLabel(margin)} margin in every group, because I will compare them`,
                      )
                }
                checked={form.each === "1"}
                onChange={(v) => set({ each: v ? "1" : "0" })}
              />
              <div className="table-scroll">
                <table className="groups">
                  <thead>
                    <tr>
                      <th>{L("Grupė", "Group")}</th>
                      <th className="cell-num">{L("Žmonių", "People")}</th>
                      <th className="cell-num">{L("Reikia atsakymų", "Responses needed")}</th>
                      <th className="cell-num">{L("Išsiųsti", "Send")}</th>
                      <th aria-label={L("Veiksmai", "Actions")} />
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g, i) => {
                      const groupN = allocation?.[i] ?? 0;
                      const send = Math.min(Math.ceil(groupN / rr - 1e-9), g.size);
                      return (
                        <tr key={i}>
                          <td>
                            <input aria-label={L("Grupės pavadinimas", "Group name")} value={g.name} onChange={(e) => setGroup(i, { name: e.target.value })} />
                          </td>
                          <td className="cell-num">
                            <input
                              aria-label={`${g.name}: ${L("žmonių skaičius", "number of people")}`}
                              inputMode="numeric"
                              className="num"
                              value={g.size || ""}
                              onChange={(e) => setGroup(i, { size: parseNum(e.target.value) || 0 })}
                            />
                          </td>
                          <td className="cell-num">{fmtInt(groupN)}</td>
                          <td className="cell-num">{Number.isFinite(send) ? fmtInt(send) : "–"}</td>
                          <td>
                            <button
                              type="button"
                              className="row-x"
                              aria-label={`${L("Pašalinti", "Remove")} ${g.name}`}
                              title={L("Pašalinti", "Remove")}
                              onClick={() => set({ groups: serializeGroups(groups.filter((_, j) => j !== i)) })}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>{L("Iš viso", "Total")}</td>
                      <td className="cell-num">{fmtInt(population ?? 0)}</td>
                      <td className="cell-num">{fmtInt(allocationTotal)}</td>
                      <td className="cell-num">
                        {fmtInt(allocation?.reduce((s, a, i) => s + Math.min(Math.ceil(a / rr - 1e-9), groups[i].size), 0) ?? 0)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => set({ groups: serializeGroups([...groups, { name: L("Nauja grupė", "New group"), size: 100 }]) })}>
                  {L("+ Grupė", "+ Group")}
                </button>
                <button type="button" onClick={() => set({ groups: "" })}>
                  {L("Be grupių", "No groups")}
                </button>
              </div>
              {form.each === "1" && (
                <p className="block-lead">
                  {L(
                    `Palyginimui tiek pat tikslumo reikia kiekvienoje grupėje, todėl imtis gerokai didesnė nei ${fmtInt(n)}. Tai tas pats „385 kiekviename regione“ principas.`,
                    `A comparison needs the same precision in every group, so the sample is much larger than ${fmtInt(n)}. It is the same “385 in every region” rule.`,
                  )}
                </p>
              )}
              {groups.some((g, i) => allocation && allocation[i] > 0 && Math.ceil(allocation[i] / rr) > g.size) && (
                <Notice title={L("Kai kuriose grupėse žmonių per mažai.", "Some groups are too small.")}>
                  {L("Net visiems išsiuntus, tikėtina gauti mažiau atsakymų, nei reikia.", "Even if everyone is invited, fewer responses than needed are likely.")}
                </Notice>
              )}
            </>
          )}
        </section>
      )}

      {ok && need && !isMean && k === 1 && (
        <section className="block" aria-labelledby="scen-title">
          <h2 id="scen-title">{L("Kas, jeigu paklaida kitokia?", "What if the margin were different?")}</h2>
          <div className="table-scroll">
            <table className="scenarios">
              <thead>
                <tr>
                  <th>{L("Paklaida", "Margin")}</th>
                  {MARGINS.map((m) => (
                    <th key={m} className="cell-num">
                      ±{fmtPct(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{L("Reikia atsakymų", "Responses needed")}</td>
                  {MARGINS.map((m) => (
                    <td key={m} className={`cell-num ${Math.abs(m - margin) < 1e-9 ? "current" : ""}`}>
                      {fmtInt(sizeFor(m))}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>{L(`Išsiųsti (${fmtPct(rr, 0)} atsakas)`, `Send (${fmtPct(rr, 0)} response)`)}</td>
                  {MARGINS.map((m) => {
                    const r = invitations(sizeFor(m), rr, population);
                    return (
                      <td key={m} className={`cell-num ${Math.abs(m - margin) < 1e-9 ? "current" : ""}`}>
                        {r.possible ? fmtInt(r.send) : L("per mažai žmonių", "too few people")}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="block honest" aria-labelledby="repr-title">
        <h2 id="repr-title">{L("Ar tai bus reprezentatyvu?", "Will it be representative?")}</h2>
        {L(
          <p>
            <b>Imties dydis to nenulemia.</b> Formulė pasako, kiek atsakymų reikia, <i>jei</i> respondentai atrinkti atsitiktinai.
            Reprezentatyvumą lemia, kaip jie atrinkti ir kas neatsakė. 1 000 savanoriškų atsakymų iš socialinių tinklų gali būti
            blogiau nei 200 iš atsitiktinio sąrašo.
          </p>,
          <p>
            <b>Sample size does not decide that.</b> The formula says how many responses you need <i>if</i> respondents are picked at
            random. Representativeness depends on how they were picked and who did not answer. 1,000 volunteers from social media can
            be worse than 200 from a random list.
          </p>,
        )}
        {bounds &&
          L(
            <p>
              Pavyzdžiui, jei {need ? "atsakys" : "atsakė"} {fmtPct(rr, 0)}, o „taip“ {need ? "pasakys" : "pasakė"} {fmtPct(p, 0)}, blogiausiu
              atveju tikroji dalis visoje grupėje gali būti nuo <b>{fmtPct(bounds[0], 0)}</b> iki <b>{fmtPct(bounds[1], 0)}</b>, nes
              neatsakiusieji gali visi galvoti kitaip.
              {need && " Šito didesnė imtis nepataiso, pataiso tik didesnis atsakas: priminimai, trumpesnė anketa, vadovybės palaikymas."}
            </p>,
            <p>
              For example, if {fmtPct(rr, 0)} {need ? "respond" : "responded"} and {fmtPct(p, 0)} {need ? "say" : "said"} “yes”, in the
              worst case the true proportion in the whole population could be anywhere from <b>{fmtPct(bounds[0], 0)}</b> to{" "}
              <b>{fmtPct(bounds[1], 0)}</b>, because the non-respondents might all think otherwise.
              {need && " A larger sample does not fix this; only a higher response rate does: reminders, a shorter questionnaire, backing from management."}
            </p>,
          )}
      </section>

      {report && <ReportBlock report={report} />}
    </>
  );
}
