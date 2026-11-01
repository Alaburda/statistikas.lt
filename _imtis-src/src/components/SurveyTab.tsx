import { useMemo } from "react";
import {
  allocate,
  cochranN,
  designEffect,
  invitations,
  marginOf,
  meanMarginOf,
  meanN,
  nonresponseBounds,
  paniottoN,
  type Stratum,
} from "../engine/survey";
import { fmtInt, fmtPct, fmtShort, ltPlural, parseNum } from "../format";
import { surveyReport } from "../report";
import { useForm } from "../url";
import { Check, More, NumField, Notice, Peek, Segmented } from "./Fields";
import { ReportBlock } from "./ReportBlock";

const DEFAULTS = {
  mode: "need",
  N: "1200",
  e: "5",
  got: "180",
  conf: "95",
  p: "50",
  rr: "40",
  formula: "cochran",
  measure: "share",
  sd: "15",
  em: "2",
  cl: "",
  icc: "",
  groups: "",
  each: "0",
};

const ANSWERS: [string, string, string] = ["užpildyta anketa", "užpildytos anketos", "užpildytų anketų"];
const INVITES: [string, string, string] = ["kvietimą", "kvietimus", "kvietimų"];
const MARGINS = [0.03, 0.04, 0.05, 0.07, 0.1];

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
  { name: "Vidaus ligos", size: 420 },
  { name: "Chirurgija", size: 380 },
  { name: "Intensyvioji terapija", size: 250 },
  { name: "Kiti skyriai", size: 150 },
];

export function SurveyTab({ active }: { active: boolean }) {
  const [form, set] = useForm("apklausa", active, DEFAULTS);
  const groups = useMemo(() => parseGroups(form.groups), [form.groups]);
  const usesGroups = groups.length > 0;

  const population = usesGroups
    ? groups.reduce((s, g) => s + g.size, 0) || null
    : form.N.trim() === ""
      ? null
      : parseNum(form.N);
  const confidence = parseNum(form.conf) / 100;
  const p = parseNum(form.p) / 100;
  const rr = parseNum(form.rr) / 100;
  const isMean = form.measure === "mean";
  const paniotto = form.formula === "paniotto" && !isMean;
  const margin = isMean ? parseNum(form.em) : parseNum(form.e) / 100;
  const sd = parseNum(form.sd);
  const clusterSize = parseNum(form.cl);
  const icc = parseNum(form.icc);
  const deff = clusterSize > 1 && icc >= 0 ? designEffect(clusterSize, icc) : 1;

  const errors = {
    N: population !== null && !(population >= 2) ? "Įveskite bent 2 arba palikite tuščią." : null,
    e: !isMean && !(margin > 0 && margin < 1) ? "Paklaida turi būti tarp 0 ir 100 %." : null,
    p: !(p > 0 && p < 1) ? "Dalis turi būti tarp 0 ir 100 %." : null,
    rr: !(rr > 0 && rr <= 1) ? "Atsakas turi būti nuo 1 iki 100 %." : null,
    got: !(parseNum(form.got) >= 1) ? "Įveskite atsakymų skaičių." : null,
    em: isMean && !(margin > 0) ? "Įveskite paklaidą." : null,
    sd: isMean && !(sd > 0) ? "Įveskite standartinį nuokrypį." : null,
  };
  const need = form.mode === "need";
  const ok = !errors.N && !errors.rr && (isMean ? !errors.em && !errors.sd : !errors.e && !errors.p) && (need || !errors.got);

  const base = { population, confidence, p, deff };
  const sizeFor = (m: number) =>
    paniotto ? paniottoN(m, population) : isMean ? meanN(sd, m, confidence, population, deff) : cochranN({ ...base, margin: m });

  const n = ok ? sizeFor(margin) : 0;
  const alt = ok && !isMean ? (paniotto ? cochranN({ ...base, margin }) : paniottoN(margin, population)) : null;
  const got = Math.min(parseNum(form.got), population ?? Infinity);
  const marginAt = (answers: number) =>
    isMean ? meanMarginOf(answers, sd, confidence, population, deff) : marginOf(answers, base);

  const shareLabel = (m: number) => (isMean ? `±${fmtShort(m, 3)}` : `±${fmtPct(m)}`);
  const bounds = ok && !isMean ? nonresponseBounds(p, rr) : null;

  const allocation = useMemo(() => {
    if (!ok || !usesGroups) return null;
    if (form.each === "1") {
      return groups.map((g) => {
        if (g.size <= 0) return 0;
        if (paniotto) return paniottoN(margin, g.size);
        return isMean ? meanN(sd, margin, confidence, g.size, deff) : cochranN({ ...base, population: g.size, margin });
      });
    }
    return allocate(groups, n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, usesGroups, form.each, groups, n, margin, confidence, p, deff, sd, isMean, paniotto]);
  const allocationTotal = allocation?.reduce((a, b) => a + b, 0) ?? 0;
  const perGroup = usesGroups && form.each === "1" && allocationTotal > 0;
  const answers = perGroup ? allocationTotal : n;
  const reach = ok ? invitations(answers, rr, population) : null;

  const report = ok && reach
    ? surveyReport({
        formula: paniotto ? "paniotto" : "cochran",
        measure: isMean ? "mean" : "share",
        population,
        margin,
        confidence,
        p,
        sd,
        deff,
        clusterSize: clusterSize > 1 ? clusterSize : null,
        icc: icc >= 0 ? icc : null,
        n: answers,
        strata: usesGroups ? { sizes: groups.map((g) => g.size), ns: allocation ?? [], each: perGroup } : undefined,
        responseRate: rr,
        send: reach.send,
        possible: reach.possible,
        expectedAnswers: reach.expectedAnswers,
      })
    : null;

  function setGroup(i: number, patch: Partial<Stratum>) {
    set({ groups: serializeGroups(groups.map((g, j) => (j === i ? { ...g, ...patch } : g))) });
  }

  return (
    <>
      <div className="calc">
        <form className="inputs" onSubmit={(e) => e.preventDefault()}>
          <Segmented
            label="Ko ieškote?"
            value={form.mode as "need" | "have"}
            onChange={(mode) => set({ mode })}
            options={[
              { value: "need", label: "Kiek žmonių apklausti" },
              { value: "have", label: "Jau turiu atsakymų" },
            ]}
          />
          {!usesGroups && (
            <NumField
              label="Kiek žmonių yra tiriamojoje grupėje?"
              hint="Pvz., visos ligoninės slaugytojos. Jei jų labai daug ar skaičius nežinomas, palikite tuščią."
              value={form.N}
              onChange={(N) => set({ N })}
              placeholder="labai daug"
              decimal={false}
              error={errors.N}
            />
          )}
          {need ? (
            !isMean && (
              <NumField
                label="Leistina paklaida"
                hint="Jei 40 % atsakė „taip“, ±5 % reiškia: tikroji dalis tarp 35 ir 45 %."
                value={form.e}
                onChange={(e) => set({ e })}
                suffix="± %"
                error={errors.e}
              />
            )
          ) : (
            <NumField label="Kiek atsakymų gavote?" value={form.got} onChange={(got) => set({ got })} decimal={false} error={errors.got} />
          )}
          {need && (
            <Segmented
              label="Formulė"
              hint={
                paniotto
                  ? "Lietuvos darbuose dažniausia. Ji tokia pati kaip Yamane formulė: visada laiko, kad patikimumas apie 95 % ir dalis 50 %."
                  : "Tarptautinis standartas: galima keisti patikimumą ir tikėtiną dalį."
              }
              value={(isMean ? "cochran" : form.formula) as "cochran" | "paniotto"}
              onChange={(formula) => set({ formula, measure: formula === "paniotto" ? "share" : form.measure })}
              options={[
                { value: "cochran", label: "Cochran" },
                { value: "paniotto", label: "Paniotto" },
              ]}
            />
          )}
          {(!paniotto || !need) && (
            <Segmented
              label="Patikimumo lygis"
              value={form.conf as "90" | "95" | "99"}
              onChange={(conf) => set({ conf })}
              options={[
                { value: "90", label: "90 %" },
                { value: "95", label: "95 %" },
                { value: "99", label: "99 %" },
              ]}
            />
          )}
          <NumField
            label="Kokia dalis pakviestųjų atsakys?"
            hint="Vidinėse apklausose dažnai 30–60 %, atvirose internetinėse daug mažiau."
            value={form.rr}
            onChange={(rr) => set({ rr })}
            suffix="%"
            error={errors.rr}
          />

          <More title="Daugiau nustatymų">
            {(!paniotto || !need) && !isMean && (
              <NumField
                label="Tikėtina atsakymo dalis"
                hint="Nežinote? Palikite 50 %: tai saugiausias variantas, duodantis didžiausią imtį."
                value={form.p}
                onChange={(p) => set({ p })}
                suffix="%"
                error={errors.p}
              />
            )}
            <Check
              label="Vertinsiu vidurkį, ne dalį (pvz., balą skalėje)"
              checked={isMean}
              onChange={(v) => set({ measure: v ? "mean" : "share", formula: "cochran" })}
            />
            {isMean && (
              <>
                <NumField label="Numatomas standartinis nuokrypis" value={form.sd} onChange={(sd) => set({ sd })} error={errors.sd} />
                {need && <NumField label="Leistina paklaida, vienetais" hint="Pvz., ±2 balai." value={form.em} onChange={(em) => set({ em })} suffix="±" error={errors.em} />}
              </>
            )}
            <NumField
              label="Žmonių viename klasteryje"
              hint="Jei renkate ne po vieną žmogų, o ištisus skyrius ar klases. Kitaip palikite tuščią."
              value={form.cl}
              onChange={(cl) => set({ cl })}
              decimal={false}
            />
            {clusterSize > 1 && (
              <NumField
                label="Vidinė klasterio koreliacija (ICC)"
                hint={`Dažnai 0,01–0,05. Dizaino efektas: ${fmtShort(deff)}.`}
                value={form.icc}
                onChange={(icc) => set({ icc })}
              />
            )}
          </More>
          {ok && <Peek value={need ? fmtInt(answers) : shareLabel(marginAt(got))} label={need ? ltPlural(answers, ANSWERS) : "paklaida"} />}
        </form>

        <div className="result" aria-live="polite">
          {!ok ? (
            <p className="result-empty">Pataisykite pažymėtus laukus.</p>
          ) : need ? (
            <>
              <span className="eyebrow">Atsakymas</span>
              <p className="big">{fmtInt(answers)}</p>
              <p className="big-unit">
                {ltPlural(answers, ANSWERS)}
                {perGroup ? ` iš viso, ${groups.length} grupėse` : ""}
              </p>
              {reach && (
                <p className="result-line">
                  Išsiųskite <b>{fmtInt(reach.send)}</b> {ltPlural(reach.send, INVITES)}
                  {reach.possible ? `, nes atsakys apie ${fmtPct(rr, 0)}.` : ` – tai visi grupės nariai.`}
                </p>
              )}
              {alt !== null && !perGroup && (
                <p className="result-alt">
                  {paniotto ? "Pagal Cochran formulę" : "Pagal Paniotto formulę"}: {fmtInt(alt)}
                </p>
              )}
              {reach && !reach.possible && (
                <Notice title="Tokio tikslumo pasiekti nepavyks.">
                  Net pakvietus visus {fmtInt(population!)}, atsakys apie {fmtInt(reach.expectedAnswers)}
                  {perGroup ? "" : `, o paklaida bus ${shareLabel(marginAt(reach.expectedAnswers))}`}. Reikia didesnio atsako arba kuklesnio tikslumo.
                </Notice>
              )}
            </>
          ) : (
            <>
              <span className="eyebrow">Jūsų paklaida</span>
              <p className="big">{shareLabel(marginAt(got))}</p>
              <p className="big-unit">
                su {fmtInt(got)} {ltPlural(got, ["atsakymu", "atsakymais", "atsakymų"])}
                {population ? ` iš ${fmtInt(population)}` : ""}, {fmtPct(confidence, 0)} patikimumas
              </p>
              {!isMean && (
                <p className="result-line">
                  Jei „taip“ atsakė {fmtPct(p, 0)}, tikroji dalis tikriausiai tarp{" "}
                  <b>
                    {fmtPct(Math.max(p - marginAt(got), 0), 1)} ir {fmtPct(Math.min(p + marginAt(got), 1), 1)}
                  </b>
                  .
                </p>
              )}
              {population !== null && (
                <p className="result-alt">
                  Atsakė {fmtPct(got / population, 0)} grupės. Ši paklaida laiko, kad atsakiusieji nesiskiria nuo neatsakiusiųjų.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <section className="block" aria-labelledby="groups-title">
        <h2 id="groups-title">Paskirstymas pagal grupes</h2>
        {!usesGroups ? (
          <>
            <p className="block-lead">
              Skyriai, regionai ar amžiaus grupės skiriasi? Reprezentatyvumą paprasčiausia užtikrinti atrenkant iš kiekvienos
              grupės proporcingai jos dydžiui.
            </p>
            <button type="button" onClick={() => set({ groups: serializeGroups(EXAMPLE_GROUPS) })}>
              Pridėti grupes
            </button>
          </>
        ) : (
          <>
            <Check
              label={`Noriu ${isMean ? `±${fmtShort(margin, 3)}` : `±${fmtPct(margin)}`} paklaidos kiekvienoje grupėje, nes jas lyginsiu`}
              checked={form.each === "1"}
              onChange={(v) => set({ each: v ? "1" : "0" })}
            />
            <div className="table-scroll">
              <table className="groups">
                <thead>
                  <tr>
                    <th>Grupė</th>
                    <th className="cell-num">Žmonių</th>
                    <th className="cell-num">Reikia atsakymų</th>
                    <th className="cell-num">Išsiųsti</th>
                    <th aria-label="Veiksmai" />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => {
                    const groupN = allocation?.[i] ?? 0;
                    const send = Math.min(Math.ceil(groupN / rr - 1e-9), g.size);
                    return (
                      <tr key={i}>
                        <td>
                          <input aria-label="Grupės pavadinimas" value={g.name} onChange={(e) => setGroup(i, { name: e.target.value })} />
                        </td>
                        <td className="cell-num">
                          <input
                            aria-label={`${g.name}: žmonių skaičius`}
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
                            aria-label={`Pašalinti ${g.name}`}
                            title="Pašalinti"
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
                    <td>Iš viso</td>
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
              <button type="button" onClick={() => set({ groups: serializeGroups([...groups, { name: "Nauja grupė", size: 100 }]) })}>
                + Grupė
              </button>
              <button type="button" onClick={() => set({ groups: "" })}>
                Be grupių
              </button>
            </div>
            {form.each === "1" && (
              <p className="block-lead">
                Palyginimui tiek pat tikslumo reikia kiekvienoje grupėje, todėl imtis gerokai didesnė nei {fmtInt(n)}. Tai tas pats
                „385 kiekviename regione“ principas.
              </p>
            )}
            {groups.some((g, i) => allocation && allocation[i] > 0 && Math.ceil(allocation[i] / rr) > g.size) && (
              <Notice title="Kai kuriose grupėse žmonių per mažai.">Net visiems išsiuntus, tikėtina gauti mažiau atsakymų, nei reikia.</Notice>
            )}
          </>
        )}
      </section>

      {ok && need && !isMean && (
        <section className="block" aria-labelledby="scen-title">
          <h2 id="scen-title">Kas, jeigu paklaida kitokia?</h2>
          <div className="table-scroll">
            <table className="scenarios">
              <thead>
                <tr>
                  <th>Paklaida</th>
                  {MARGINS.map((m) => (
                    <th key={m} className="cell-num">
                      ±{fmtShort(m * 100)} %
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Reikia atsakymų</td>
                  {MARGINS.map((m) => (
                    <td key={m} className={`cell-num ${Math.abs(m - margin) < 1e-9 ? "current" : ""}`}>
                      {fmtInt(sizeFor(m))}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Išsiųsti ({fmtPct(rr, 0)} atsakas)</td>
                  {MARGINS.map((m) => {
                    const r = invitations(sizeFor(m), rr, population);
                    return (
                      <td key={m} className={`cell-num ${Math.abs(m - margin) < 1e-9 ? "current" : ""}`}>
                        {r.possible ? fmtInt(r.send) : "per mažai žmonių"}
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
        <h2 id="repr-title">Ar tai bus reprezentatyvu?</h2>
        <p>
          <b>Imties dydis to nenulemia.</b> Formulė pasako, kiek atsakymų reikia, <i>jei</i> respondentai atrinkti atsitiktinai.
          Reprezentatyvumą lemia, kaip jie atrinkti ir kas neatsakė. 1 000 savanoriškų atsakymų iš socialinių tinklų gali būti
          blogiau nei 200 iš atsitiktinio sąrašo.
        </p>
        {bounds && (
          <p>
            Pavyzdžiui, jei atsakys {fmtPct(rr, 0)}, o „taip“ pasakys {fmtPct(p, 0)}, blogiausiu atveju tikroji dalis visoje grupėje
            gali būti nuo <b>{fmtPct(bounds[0], 0)}</b> iki <b>{fmtPct(bounds[1], 0)}</b>, nes neatsakiusieji gali visi galvoti kitaip.
            Šito didesnė imtis nepataiso, pataiso tik didesnis atsakas: priminimai, trumpesnė anketa, vadovybės palaikymas.
          </p>
        )}
      </section>

      {report && <ReportBlock report={report} />}
    </>
  );
}
