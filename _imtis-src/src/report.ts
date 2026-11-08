// The paragraph for a methods section (Lithuanian and English), its references and
// the code that reproduces the number. Published sample size calculations are rarely
// reproducible because inputs go unreported, so every input is spelled out here.

import { DESIGNS, type BeInput } from "./engine/be";
import { chisqDf, factorialDf, mcnemarCells, regF2, type Spec, type Test } from "./engine/compare";
import type { Estimate } from "./engine/survey";
import { enInt, enNum, enPct, ltInt, ltPct, ltShort, ltPlural, rNum } from "./format";

export interface Report {
  /** One formal sentence for a results or methods section, with an author–year citation. */
  statement: { lt: string; en: string };
  lt: string;
  en: string;
  refs: string[];
  r: string;
  gpower?: string;
}

type Paragraph = Omit<Report, "statement">;

const REF = {
  cochran: "Cochran WG. Sampling Techniques. 3rd ed. New York: Wiley; 1977.",
  yamane: "Yamane T. Statistics: An Introductory Analysis. 2nd ed. New York: Harper & Row; 1967.",
  wilson: "Wilson EB. Probable inference, the law of succession, and statistical inference. J Am Stat Assoc. 1927;22(158):209–212.",
  cohen: "Cohen J. Statistical Power Analysis for the Behavioral Sciences. 2nd ed. Hillsdale, NJ: Erlbaum; 1988.",
  fleiss: "Fleiss JL, Levin B, Paik MC. Statistical Methods for Rates and Proportions. 3rd ed. Hoboken, NJ: Wiley; 2003.",
  schuirmann:
    "Schuirmann DJ. A comparison of the two one-sided tests procedure and the power approach for assessing the equivalence of average bioavailability. J Pharmacokinet Biopharm. 1987;15(6):657–680.",
  powertost: "Labes D, Schütz H, Lang B. PowerTOST: Power and Sample Size for (Bio)Equivalence Studies. R package.",
  ema: "European Medicines Agency. Guideline on the Investigation of Bioequivalence. CPMP/EWP/QWP/1401/98 Rev. 1/Corr**. London: EMA; 2010.",
  gpower:
    "Faul F, Erdfelder E, Lang AG, Buchner A. G*Power 3: A flexible statistical power analysis program for the social, behavioral, and biomedical sciences. Behav Res Methods. 2007;39(2):175–191.",
  gpower31:
    "Faul F, Erdfelder E, Buchner A, Lang AG. Statistical power analyses using G*Power 3.1: Tests for correlation and regression analyses. Behav Res Methods. 2009;41(4):1149–1160.",
  borm: "Borm GF, Fransen J, Lemmens WA. A simple sample size formula for analysis of covariance in randomized clinical trials. J Clin Epidemiol. 2007;60(12):1234–1238.",
  demidenko: "Demidenko E. Sample size determination for logistic regression revisited. Stat Med. 2007;26(18):3385–3397.",
};

function compareRefs(spec: Spec): string[] {
  switch (spec.kind) {
    case "props":
      return [REF.fleiss];
    case "anova":
    case "factorial":
      return spec.covariates ? [REF.cohen, REF.borm, REF.gpower] : spec.kind === "factorial" ? [REF.cohen, REF.gpower] : [REF.cohen];
    case "rm":
    case "mcnemar":
      return [REF.gpower];
    case "reg":
      return [REF.cohen, REF.gpower31];
    case "logit":
      return [REF.demidenko, REF.gpower31];
    default:
      return [REF.cohen];
  }
}

function compareCite(spec: Spec): { lt: string; en: string } {
  switch (spec.kind) {
    case "props":
      return { lt: "Fleiss ir kt., 2003", en: "Fleiss et al., 2003" };
    case "anova":
    case "factorial":
      return spec.covariates ? { lt: "Cohen, 1988; Borm ir kt., 2007", en: "Cohen, 1988; Borm et al., 2007" } : { lt: "Cohen, 1988", en: "Cohen, 1988" };
    case "rm":
    case "mcnemar":
      return { lt: "Faul ir kt., 2007", en: "Faul et al., 2007" };
    case "logit":
      return { lt: "Demidenko, 2007", en: "Demidenko, 2007" };
    default:
      return { lt: "Cohen, 1988", en: "Cohen, 1988" };
  }
}

// ---- Surveys ----

export interface SurveyFacts {
  formula: "cochran" | "paniotto";
  measure: "share" | "mean";
  population: number | null;
  margin: number;
  confidence: number;
  p: number;
  sd: number;
  deff: number;
  clusterSize: number | null;
  icc: number | null;
  n: number;
  responseRate: number;
  send: number;
  possible: boolean;
  expectedAnswers: number;
  /** Set when the sample is split across named groups. */
  strata?: { sizes: number[]; ns: number[]; each: boolean };
  /** Set when several key estimates were sized; the largest n decides. */
  estimates?: (Estimate & { n: number })[];
  /** Number of estimates a Bonferroni correction covers, if any. */
  joint: number | null;
  /** Set when the expected share came from a pilot. */
  pilot: { x: number; n: number; low: number; high: number } | null;
}

/** The margin reached by a survey that is already done. */
export interface AchievedFacts {
  population: number | null;
  got: number;
  /** Level before any Bonferroni correction. */
  confidence: number;
  level: number;
  joint: number | null;
  deff: number;
  responseRate: number;
  estimates: (Estimate & { reached: number })[];
}

const WHY_LT = " [Įrašykite, kodėl pasirinkta ši paklaida ir kaip bus atrenkami respondentai.]";
const WHY_EN = " [State why this margin was chosen and how respondents will be selected.]";

const answersLt = (n: number) => ltPlural(n, ["užpildyta anketa", "užpildytos anketos", "užpildytų anketų"]);
const answersGen = (n: number) => ltPlural(n, ["užpildytos anketos", "užpildytų anketų", "užpildytų anketų"]);

/** z for the R code; a Bonferroni level is spelled out so that it stays exact. */
function zCode(confidence: number, joint: number | null): string {
  const alpha = rNum(1 - confidence);
  return joint ? `z <- qnorm(1 - ${alpha} / (2 * ${joint}))  # Bonferroni` : `z <- qnorm(1 - ${rNum((1 - confidence) / 2)})`;
}

const varianceCode = (e: Estimate) => (e.kind === "mean" ? `${rNum(e.value)}^2` : `${rNum(e.value)} * (1 - ${rNum(e.value)})`);
const rComment = (s: string) => s.replace(/[\r\n]/g, " ");

function pilotText(f: SurveyFacts): { lt: string; en: string } {
  if (!f.pilot) return { lt: "", en: "" };
  const { x, n, low, high } = f.pilot;
  return {
    lt: ` Tikėtina dalis pagrįsta bandomąja apklausa (${ltInt(x)} iš ${ltInt(n)}; Wilson 95 % PI ${ltPct(low, 0)}–${ltPct(high, 0)}): planuota su PI riba, artimiausia 50 %.`,
    en: ` The expected proportion comes from a pilot survey (${enInt(x)} of ${enInt(n)}; Wilson 95% CI ${enPct(low, 0)}–${enPct(high, 0)}), planned with the limit nearest 50%.`,
  };
}

function jointText(joint: number | null, confidence: number): { lt: string; en: string } {
  if (!joint) return { lt: "", en: "" };
  const level = 1 - (1 - confidence) / joint;
  return {
    lt: ` Kad visi ${joint} rodikliai galiotų kartu, taikyta Bonferroni pataisa (kiekvienam rodikliui patikimumo lygis ${ltPct(level, 2)}).`,
    en: ` A Bonferroni correction was applied so that all ${joint} estimates hold jointly (${enPct(level, 2)} confidence level for each).`,
  };
}

function deffText(deff: number): { lt: string; en: string } {
  return deff > 1
    ? {
        lt: ` Dėl klasterinės atrankos pritaikytas dizaino efektas ${ltShort(deff)}.`,
        en: ` A design effect of ${enNum(deff)} was applied for cluster sampling.`,
      }
    : { lt: "", en: "" };
}

/** The most demanding of several key estimates decides the sample size. */
function severalReport(f: SurveyFacts, estimates: NonNullable<SurveyFacts["estimates"]>): Paragraph {
  const paniotto = f.formula === "paniotto";
  const hasMean = estimates.some((e) => e.kind === "mean");
  const fpcLt = f.population === null ? "" : " su baigtinės populiacijos pataisa";
  const fpcEn = f.population === null ? "" : " with a finite population correction";
  const methodLt = paniotto ? `Paniotto formulę${hasMean ? ", vidurkiams – Cochran formulę" : ""}` : `Cochran formulę${fpcLt}`;
  const methodEn = paniotto ? `Yamane's formula${hasMean ? ", and for means Cochran's formula" : ""}` : `Cochran's formula${fpcEn}`;
  const itemLt = (e: (typeof estimates)[number]) => {
    const inputs =
      e.kind === "mean"
        ? `SD ${ltShort(e.value, 3)}, paklaida ±${ltShort(e.margin, 3)}`
        : paniotto
          ? `paklaida ±${ltPct(e.margin)}`
          : `tikėtina dalis ${ltPct(e.value)}, paklaida ±${ltPct(e.margin)}`;
    return `${e.name} (${inputs}): n = ${ltInt(e.n)}`;
  };
  const itemEn = (e: (typeof estimates)[number]) => {
    const inputs =
      e.kind === "mean"
        ? `SD ${enNum(e.value, 3)}, margin ±${enNum(e.margin, 3)}`
        : paniotto
          ? `margin ±${enPct(e.margin)}`
          : `expected proportion ${enPct(e.value)}, margin ±${enPct(e.margin)}`;
    return `${e.name} (${inputs}): n = ${enInt(e.n)}`;
  };
  const each = f.strata?.each ? f.strata : null;
  const nLt = f.population === null ? "kai generalinė visuma labai didelė" : `kai generalinė visuma N = ${ltInt(f.population)}`;
  const nEn = f.population === null ? "for a very large population" : `for a population of N = ${enInt(f.population)}`;
  const confLt = paniotto ? "" : `, patikimumo lygis ${ltPct(f.confidence, 0)}`;
  const confEn = paniotto ? "" : `, a ${enPct(f.confidence, 0)} confidence level`;
  const totalLt = each
    ? ` Skaičiavimas pakartotas kiekvienai iš ${each.sizes.length} grupių, kad jas būtų galima lyginti: iš viso n = ${each.ns.map(ltInt).join(" + ")} = ${ltInt(f.n)} ${answersGen(f.n)}.`
    : ` Reikia n = ${ltInt(f.n)} ${answersGen(f.n)}.`;
  const totalEn = each
    ? ` The calculation was repeated for each of the ${each.sizes.length} groups so that they can be compared: n = ${each.ns.map(enInt).join(" + ")} = ${enInt(f.n)} completed questionnaires in total.`
    : ` n = ${enInt(f.n)} completed questionnaires are needed.`;
  const stratified = f.strata && !each;
  const send = responseText(f);
  const joint = jointText(f.joint, f.confidence);
  const deff = deffText(f.deff);
  const pilot = pilotText(f);

  const N = each ? `c(${each.sizes.map(rNum).join(", ")})` : f.population === null ? "Inf" : rNum(f.population);
  const usesCochran = !paniotto || hasMean;
  const calls = estimates.map((e) => {
    const call = paniotto && e.kind === "share" ? `paniotto(${rNum(e.margin)})` : `cochran(${varianceCode(e)}, ${rNum(e.margin)})`;
    return `  ${call},  # ${rComment(e.name)}`;
  });
  calls[calls.length - 1] = calls[calls.length - 1].replace(",  #", "   #");
  const r = [
    `N <- ${N}; deff <- ${rNum(f.deff)}`,
    ...(usesCochran
      ? [
          zCode(f.confidence, f.joint),
          "cochran <- function(v, E) {",
          "  n0 <- z^2 * v * deff / E^2",
          "  ceiling(n0 / (1 + (n0 - 1) / N))",
          "}",
        ]
      : []),
    ...(paniotto ? ["paniotto <- function(e) ceiling(deff / (e^2 + deff / N))"] : []),
    "n <- pmax(",
    ...calls,
    ")",
    `sum(n)  # ${f.n}`,
  ].join("\n");

  return {
    lt: `Planuojami keli pagrindiniai rodikliai, todėl imties dydis apskaičiuotas kiekvienam atskirai pagal ${methodLt}, ${nLt}${confLt}, ir pasirinktas didžiausias: ${estimates.map(itemLt).join("; ")}.${pilot.lt}${joint.lt}${deff.lt}${totalLt}${send.lt}${stratified ? ` Respondentai atrenkami iš ${f.strata!.sizes.length} grupių proporcingai jų dydžiui.` : ""}${WHY_LT}`,
    en: `Several key estimates are planned, so the sample size was calculated for each with ${methodEn}, ${nEn}${confEn}, and the largest was taken: ${estimates.map(itemEn).join("; ")}.${pilot.en}${joint.en}${deff.en}${totalEn}${send.en}${stratified ? ` Respondents will be drawn from ${f.strata!.sizes.length} strata in proportion to their size.` : ""}${WHY_EN}`,
    refs: [REF.cochran, ...(paniotto ? [REF.yamane] : []), ...(f.pilot ? [REF.wilson] : [])],
    r,
  };
}

/** A survey that is done: what its answers can and cannot support. */
export function achievedReport(f: AchievedFacts): Report {
  return { ...achievedParagraph(f), statement: achievedStatement(f) };
}

function achievedParagraph(f: AchievedFacts): Paragraph {
  const several = f.estimates.length > 1;
  const nLt = `${ltInt(f.got)} ${answersLt(f.got)}${f.population === null ? "" : ` iš N = ${ltInt(f.population)}`}`;
  const itemLt = (e: AchievedFacts["estimates"][number]) =>
    e.kind === "share"
      ? `${several ? `${e.name}: ` : ""}dalis ${ltPct(e.value)}, paklaida ±${ltPct(e.reached)}`
      : `${several ? `${e.name}: ` : ""}SD ${ltShort(e.value, 3)}, paklaida ±${ltShort(e.reached, 3)}`;
  const itemEn = (e: AchievedFacts["estimates"][number]) =>
    e.kind === "share"
      ? `${several ? `${e.name}: ` : ""}proportion ${enPct(e.value)}, margin of error ±${enPct(e.reached)}`
      : `${several ? `${e.name}: ` : ""}SD ${enNum(e.value, 3)}, margin of error ±${enNum(e.reached, 3)}`;
  const joint = jointText(f.joint, f.confidence);
  const deff = deffText(f.deff);
  const fpc = f.population === null ? "fpc <- 1" : `N <- ${rNum(f.population)}; fpc <- (N - n) / (N - 1)`;
  const lines = f.estimates.map((e) => `z * sqrt(${varianceCode(e)} * deff * fpc / n)  # ${several ? `${rComment(e.name)}: ` : ""}${rNum(e.reached)}`);
  return {
    lt: `Gauta ${nLt} (atsakė ${ltPct(f.responseRate, 0)} pakviestųjų). Esant ${ltPct(f.confidence, 0)} patikimumo lygiui: ${f.estimates.map(itemLt).join("; ")}.${joint.lt}${deff.lt} Paklaida laiko, kad atsakiusieji nesiskiria nuo neatsakiusiųjų. [Įrašykite, kaip buvo atrinkti respondentai.]`,
    en: `${enInt(f.got)} completed questionnaires were received${f.population === null ? "" : ` from a population of N = ${enInt(f.population)}`} (${enPct(f.responseRate, 0)} of those invited responded). At a ${enPct(f.confidence, 0)} confidence level: ${f.estimates.map(itemEn).join("; ")}.${joint.en}${deff.en} The margin assumes that respondents do not differ from non-respondents. [State how respondents were selected.]`,
    refs: [REF.cochran],
    r: [`n <- ${rNum(f.got)}; deff <- ${rNum(f.deff)}`, fpc, zCode(f.confidence, f.joint), ...lines].join("\n"),
  };
}

function responseText(f: SurveyFacts): { lt: string; en: string } {
  return f.possible
    ? {
        lt: ` Tikintis ${ltPct(f.responseRate, 0)} atsako dažnio, numatyta išdalyti ${ltInt(f.send)} ${ltPlural(f.send, ["anketą", "anketas", "anketų"])}.`,
        en: ` Assuming a ${enPct(f.responseRate, 0)} response rate, ${enInt(f.send)} questionnaires will be distributed.`,
      }
    : {
        lt: ` Numatyta apklausti visą generalinę visumą; tikintis ${ltPct(f.responseRate, 0)} atsako dažnio, laukiama ${ltInt(f.expectedAnswers)} ${ltPlural(f.expectedAnswers, ["atsakymo", "atsakymų", "atsakymų"])}.`,
        en: ` The whole population will be invited; assuming a ${enPct(f.responseRate, 0)} response rate, ${enInt(f.expectedAnswers)} responses are expected.`,
      };
}

/** Each group sized on its own: the population-wide formula would not give this n. */
function perGroupReport(f: SurveyFacts, strata: NonNullable<SurveyFacts["strata"]>): Paragraph {
  const k = strata.sizes.length;
  const send = responseText(f);
  const parts = strata.ns.map(ltInt).join(" + ");
  const partsEn = strata.ns.map(enInt).join(" + ");
  const paniotto = f.formula === "paniotto";
  const mean = f.measure === "mean";
  const deff = deffText(f.deff);
  const methodLt = paniotto
    ? `Paniotto formulę ${f.deff > 1 ? "n = deff / (Δ² + deff/N)" : "n = 1 / (Δ² + 1/N)"}, kai Δ = ${ltShort(f.margin, 3)}`
    : `Cochran formulę su baigtinės populiacijos pataisa (patikimumo lygis ${ltPct(f.confidence, 0)}, leistina paklaida ±${mean ? ltShort(f.margin, 3) : ltPct(f.margin)}, ${mean ? `standartinis nuokrypis ${ltShort(f.sd, 3)}` : `tikėtina požymio dalis ${ltPct(f.p)}`})`;
  const methodEn = paniotto
    ? `Yamane's formula, ${f.deff > 1 ? "n = deff / (e² + deff/N)" : "n = N / (1 + Ne²)"}, with e = ${enNum(f.margin, 3)}`
    : `Cochran's formula with a finite population correction (${enPct(f.confidence, 0)} confidence level, margin of error ±${mean ? enNum(f.margin, 3) : enPct(f.margin)}, ${mean ? `standard deviation ${enNum(f.sd, 3)}` : `expected proportion ${enPct(f.p)}`})`;
  const N = `N <- c(${strata.sizes.map(rNum).join(", ")})`;
  const z = zCode(f.confidence, null);
  const variance = mean ? `${rNum(f.sd)}^2` : `${rNum(f.p)} * (1 - ${rNum(f.p)})`;
  const pilot = pilotText(f);
  return {
    lt: `Imties dydis apskaičiuotas atskirai kiekvienai iš ${k} grupių pagal ${methodLt}, kad grupes būtų galima lyginti. Iš viso reikia n = ${parts} = ${ltInt(f.n)} ${answersGen(f.n)}.${pilot.lt}${deff.lt}${send.lt}${WHY_LT}`,
    en: `The sample size was calculated separately for each of the ${k} groups with ${methodEn}, so that the groups can be compared: n = ${partsEn} = ${enInt(f.n)} completed questionnaires in total.${pilot.en}${deff.en}${send.en}${WHY_EN}`,
    refs: [paniotto ? REF.yamane : REF.cochran, ...(f.pilot ? [REF.wilson] : [])],
    r: paniotto
      ? `${N}; e <- ${rNum(f.margin)}; deff <- ${rNum(f.deff)}\nsum(ceiling(deff / (e^2 + deff / N)))  # ${f.n}`
      : `${N}; E <- ${rNum(f.margin)}; deff <- ${rNum(f.deff)}\n${z}\nn0 <- z^2 * ${variance} * deff / E^2\nsum(ceiling(n0 / (1 + (n0 - 1) / N)))  # ${f.n}`,
  };
}

export function surveyReport(f: SurveyFacts): Report {
  return { ...surveyParagraph(f), statement: surveyStatement(f) };
}

function surveyParagraph(f: SurveyFacts): Paragraph {
  if (f.estimates) return severalReport(f, f.estimates);
  if (f.strata?.each) return perGroupReport(f, f.strata);
  const strata = f.strata
    ? {
        lt: ` Respondentai atrenkami iš ${f.strata.sizes.length} grupių proporcingai jų dydžiui.`,
        en: ` Respondents will be drawn from ${f.strata.sizes.length} strata in proportion to their size.`,
      }
    : { lt: "", en: "" };
  const { lt: sendLt, en: sendEn } = responseText(f);
  const nLt = f.population === null ? "kai generalinė visuma labai didelė" : `kai generalinė visuma N = ${ltInt(f.population)}`;
  const nEn = f.population === null ? "for a very large population" : `for a population of N = ${enInt(f.population)}`;
  const { lt: deffLt, en: deffEn } = deffText(f.deff);
  const pilot = pilotText(f);
  const why = `${pilot.lt}${WHY_LT}`;
  const whyEn = `${pilot.en}${WHY_EN}`;
  const N = f.population === null ? "Inf" : rNum(f.population);

  if (f.formula === "paniotto") {
    return {
      lt: `Imties dydis apskaičiuotas pagal Paniotto formulę ${f.deff > 1 ? "n = deff / (Δ² + deff/N)" : "n = 1 / (Δ² + 1/N)"}, ${nLt}, o leistina paklaida Δ = ${ltShort(f.margin, 3)}: reikia n = ${ltInt(f.n)} ${answersGen(f.n)}.${deffLt}${sendLt}${strata.lt}${WHY_LT}`,
      en: `The required sample size was calculated with Yamane's formula, ${f.deff > 1 ? "n = deff / (e² + deff/N)" : "n = N / (1 + Ne²)"}, ${nEn} and a margin of error of e = ${enNum(f.margin, 3)}: n = ${enInt(f.n)} completed questionnaires are needed.${deffEn}${sendEn}${strata.en}${WHY_EN}`,
      refs: [REF.yamane],
      r: `N <- ${N}; e <- ${rNum(f.margin)}; deff <- ${rNum(f.deff)}\nceiling(deff / (e^2 + deff / N))  # ${f.n}`,
    };
  }
  if (f.measure === "mean") {
    return {
      lt: `Imties dydis vidurkiui įvertinti apskaičiuotas pagal Cochran formulę${f.population === null ? "" : " su baigtinės populiacijos pataisa"}: ${nLt}, patikimumo lygis ${ltPct(f.confidence, 0)}, leistina paklaida ±${ltShort(f.margin, 3)}, numatomas standartinis nuokrypis ${ltShort(f.sd, 3)}; reikia n = ${ltInt(f.n)} ${ltPlural(f.n, ["užpildytos anketos", "užpildytų anketų", "užpildytų anketų"])}.${deffLt}${sendLt}${strata.lt}${why}`,
      en: `The sample size for estimating a mean was calculated with Cochran's formula${f.population === null ? "" : " with a finite population correction"}, ${nEn}, a ${enPct(f.confidence, 0)} confidence level, a margin of error of ±${enNum(f.margin, 3)} and an expected standard deviation of ${enNum(f.sd, 3)}: n = ${enInt(f.n)} completed questionnaires are needed.${deffEn}${sendEn}${strata.en}${whyEn}`,
      refs: [REF.cochran],
      r: `N <- ${N}; E <- ${rNum(f.margin)}; sd <- ${rNum(f.sd)}; deff <- ${rNum(f.deff)}\nz <- qnorm(1 - ${rNum((1 - f.confidence) / 2)})\nn0 <- z^2 * sd^2 * deff / E^2\nceiling(n0 / (1 + (n0 - 1) / N))  # ${f.n}`,
    };
  }
  return {
    lt: `Imties dydis apskaičiuotas pagal Cochran formulę${f.population === null ? "" : " su baigtinės populiacijos pataisa"}: ${nLt}, patikimumo lygis ${ltPct(f.confidence, 0)}, leistina paklaida ±${ltPct(f.margin)}, tikėtina požymio dalis ${ltPct(f.p)}; reikia n = ${ltInt(f.n)} ${ltPlural(f.n, ["užpildytos anketos", "užpildytų anketų", "užpildytų anketų"])}.${deffLt}${sendLt}${strata.lt}${why}`,
    en: `The required sample size was calculated with Cochran's formula${f.population === null ? "" : " with a finite population correction"}, ${nEn}, a ${enPct(f.confidence, 0)} confidence level, a margin of error of ±${enPct(f.margin)} and an expected proportion of ${enPct(f.p)}: n = ${enInt(f.n)} completed questionnaires are needed.${deffEn}${sendEn}${strata.en}${whyEn}`,
    refs: [REF.cochran, ...(f.pilot ? [REF.wilson] : [])],
    r: `N <- ${N}; E <- ${rNum(f.margin)}; p <- ${rNum(f.p)}; deff <- ${rNum(f.deff)}\nz <- qnorm(1 - ${rNum((1 - f.confidence) / 2)})\nn0 <- z^2 * p * (1 - p) * deff / E^2\nceiling(n0 / (1 + (n0 - 1) / N))  # ${f.n}`,
  };
}

// ---- Comparing groups ----

export interface CompareFacts {
  spec: Spec;
  test: Test;
  /** Alpha before any multiple-comparison adjustment. */
  alphaPlain: number;
  comparisons: number;
  target: number;
  groups: number[];
  achieved: number;
  rank: boolean;
  dropout: number;
  enrolled: number[];
  abTest: boolean;
  /** Odds ratio, when the effect was entered that way. */
  or: number | null;
  /** ANCOVA: correlation of the covariates with the outcome. */
  ancovaR?: number | null;
  /** The table the effect came from: means with their SD, or percentages (sd null). */
  table?: { means: number[][]; sd: number | null } | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function sidesLt(t: Test) {
  return t.sides === 2 ? "dvipusis" : "vienpusis";
}
function sidesEn(t: Test) {
  return t.sides === 2 ? "two-sided" : "one-sided";
}

function alphaLt(f: CompareFacts) {
  return f.comparisons > 1
    ? `α = ${ltShort(f.alphaPlain, 3)}, Bonferroni pataisa ${f.comparisons} palyginimams, t. y. α = ${ltShort(f.test.alpha, 4)}`
    : `α = ${ltShort(f.test.alpha, 3)}`;
}
function alphaEn(f: CompareFacts) {
  return f.comparisons > 1
    ? `α = ${enNum(f.alphaPlain, 3)}, Bonferroni-corrected for ${f.comparisons} comparisons to α = ${enNum(f.test.alpha, 4)}`
    : `α = ${enNum(f.test.alpha, 3)}`;
}

function describeLt(f: CompareFacts): string {
  const { spec, test } = f;
  const a = `(${sidesLt(test)}, ${alphaLt(f)})`;
  switch (spec.kind) {
    case "means":
      return `Imties dydis apskaičiuotas dviejų nepriklausomų grupių t testui ${a}. Siekiant ${ltPct(f.target, 0)} galios aptikti ${ltShort(spec.delta, 3)} vnt. skirtumą, kai standartinis nuokrypis ${ltShort(spec.sd, 3)} (Cohen d = ${ltShort(spec.delta / spec.sd)})`;
    case "paired":
      return `Imties dydis apskaičiuotas priklausomų imčių t testui ${a}. Siekiant ${ltPct(f.target, 0)} galios aptikti ${ltShort(spec.delta, 3)} vnt. pokytį, kai skirtumų standartinis nuokrypis ${ltShort(spec.sdDiff, 3)} (Cohen dz = ${ltShort(spec.delta / spec.sdDiff)})`;
    case "props":
      return `Imties dydis apskaičiuotas dviejų proporcijų palyginimui ${a}, normaliuoju artiniu pagal Fleiss. Siekiant ${ltPct(f.target, 0)} galios aptikti ${f.abTest ? "konversijos" : "dalių"} skirtumą nuo ${ltPct(spec.p1, 2)} iki ${ltPct(spec.p2, 2)}${f.or ? ` (šansų santykis ${ltShort(f.or)})` : ""}`;
    case "anova":
      return spec.covariates
        ? `Imties dydis apskaičiuotas kovariacinei analizei (ANCOVA) su ${spec.groups} grupėmis${covLt(f)} (${alphaLt(f)}).${ancovaLt(f)} Siekiant ${ltPct(f.target, 0)} galios, kai pakoreguotas efekto dydis Cohen f = ${ltShort(spec.f, 3)}`
        : `Imties dydis apskaičiuotas vienfaktorei dispersinei analizei su ${spec.groups} grupėmis (${alphaLt(f)}). Siekiant ${ltPct(f.target, 0)} galios, kai efekto dydis Cohen f = ${ltShort(spec.f, 3)}`;
    case "corr":
      return `Imties dydis apskaičiuotas Pirsono koreliacijai ${a}. Siekiant ${ltPct(f.target, 0)} galios aptikti koreliaciją r = ${ltShort(spec.r, 3)}`;
    case "factorial": {
      const what = spec.effect === "A" ? "pirmo veiksnio pagrindinį efektą" : spec.effect === "B" ? "antro veiksnio pagrindinį efektą" : "veiksnių sąveiką";
      return `Imties dydis apskaičiuotas dvifaktorei dispersinei analizei (${spec.a} × ${spec.b} grupės${covLt(f)}), tikrinant ${what} (${alphaLt(f)}).${ancovaLt(f)}${tableLt(f)} Siekiant ${ltPct(f.target, 0)} galios, kai Cohen f = ${ltShort(spec.f, 3)}`;
    }
    case "rm": {
      const what = spec.effect === "within" ? "laiko efektą" : spec.effect === "between" ? "grupių skirtumą" : "grupės ir laiko sąveiką";
      const layout = spec.groups > 1 ? `${spec.groups} grupės × ${spec.times} matavimai` : `${spec.times} matavimai`;
      const eps = spec.eps < 1 && spec.effect !== "between" ? `, sferiškumo pataisa ε = ${ltShort(spec.eps, 3)}` : "";
      return `Imties dydis apskaičiuotas pakartotinių matavimų dispersinei analizei (${layout}), tikrinant ${what} (${alphaLt(f)}; koreliacija tarp matavimų ρ = ${ltShort(spec.rho, 3)}${eps}).${tableLt(f)} Siekiant ${ltPct(f.target, 0)} galios, kai Cohen f = ${ltShort(spec.f, 3)}`;
    }
    case "reg":
      return spec.tested === spec.predictors && spec.r2Base === 0
        ? `Imties dydis apskaičiuotas tiesinės regresijos modeliui su ${spec.predictors} ${ltPlural(spec.predictors, ["prognozuojančiu kintamuoju", "prognozuojančiais kintamaisiais", "prognozuojančių kintamųjų"])}, tikrinant, ar R² skiriasi nuo nulio (${alphaLt(f)}). Siekiant ${ltPct(f.target, 0)} galios, kai R² = ${ltPct(spec.r2Gain)} (f² = ${ltShort(regF2(spec), 3)})`
        : `Imties dydis apskaičiuotas tiesinei regresijai, tikrinant, ar ${spec.tested} ${ltPlural(spec.tested, ["naujas kintamasis padidina", "nauji kintamieji padidina", "naujų kintamųjų padidina"])} R² (iš viso ${spec.predictors} ${ltPlural(spec.predictors, ["kintamasis", "kintamieji", "kintamųjų"])}, R² be naujų ${ltPct(spec.r2Base)}; ${alphaLt(f)}). Siekiant ${ltPct(f.target, 0)} galios aptikti ΔR² = ${ltPct(spec.r2Gain)} (f² = ${ltShort(regF2(spec), 3)})`;
    case "logit": {
      const x =
        spec.x === "binary"
          ? `šansų santykį OR = ${ltShort(spec.or, 3)} (įvykio dalis be veiksnio ${ltPct(spec.p0)}, veiksnį turi ${ltPct(spec.share, 0)} tiriamųjų)`
          : `šansų santykį OR = ${ltShort(spec.or, 3)} vienam standartiniam nuokrypiui (įvykio dalis esant vidutinei reikšmei ${ltPct(spec.p0)})`;
      const r2 = spec.r2 > 0 ? `, kai kiti modelio kintamieji paaiškina R² = ${ltPct(spec.r2, 0)} veiksnio sklaidos` : "";
      return `Imties dydis apskaičiuotas logistinei regresijai, Wald testui pagal Demidenko (2007) su dispersijos pataisa ${a}. Siekiant ${ltPct(f.target, 0)} galios aptikti ${x}${r2}`;
    }
    case "chisq":
      return `Imties dydis apskaičiuotas χ² nepriklausomumo testui (${spec.rows} × ${spec.cols} lentelė, df = ${chisqDf(spec)}, ${alphaLt(f)}).${tableLt(f)} Siekiant ${ltPct(f.target, 0)} galios, kai efekto dydis Cohen w = ${ltShort(spec.w, 3)}`;
    case "mcnemar": {
      const c = mcnemarCells(spec);
      return `Imties dydis apskaičiuotas McNemar testui, tiksliuoju binominiu testu nesutampančioms poroms ${a}. Siekiant ${ltPct(f.target, 0)} galios aptikti „taip“ dalies pokytį nuo ${ltPct(spec.p1)} iki ${ltPct(spec.p2)}, kai atsakymą pakeičia ${ltPct(spec.disc)} tiriamųjų (taip → ne ${ltPct(c.yesNo)}, ne → taip ${ltPct(c.noYes)})`;
    }
  }
}

const tableText = (t: number[][], num: (v: number, d?: number) => string) => t.map((row) => row.map((x) => num(x, 3)).join("; ")).join(" | ");

function tableLt(f: CompareFacts): string {
  if (!f.table) return "";
  return f.table.sd === null
    ? ` Efekto dydis apskaičiuotas iš laukiamo pasiskirstymo procentais (${tableText(f.table.means, ltShort)}; grupės vienodo dydžio).`
    : ` Efekto dydis apskaičiuotas iš laukiamų vidurkių (${tableText(f.table.means, ltShort)}) ir standartinio nuokrypio ${ltShort(f.table.sd, 3)}.`;
}
function tableEn(f: CompareFacts): string {
  if (!f.table) return "";
  return f.table.sd === null
    ? ` The effect size comes from the expected percentages (${tableText(f.table.means, enNum)}; equal groups).`
    : ` The effect size comes from the expected means (${tableText(f.table.means, enNum)}) and a standard deviation of ${enNum(f.table.sd, 3)}.`;
}

const covCount = (spec: Spec) => (spec.kind === "anova" || spec.kind === "factorial" ? (spec.covariates ?? 0) : 0);
const covLt = (f: CompareFacts) => {
  const c = covCount(f.spec);
  return c > 0 ? `, ${c} ${ltPlural(c, ["kovariantė", "kovariantės", "kovariančių"])}` : "";
};
const covEn = (f: CompareFacts) => {
  const c = covCount(f.spec);
  return c > 0 ? `, ${c} covariate${c > 1 ? "s" : ""}` : "";
};
function ancovaLt(f: CompareFacts): string {
  if (!covCount(f.spec) || !f.ancovaR) return "";
  return ` Kovariantėms koreliuojant su rezultatu R = ${ltShort(f.ancovaR, 3)}, efekto dydis padalytas iš √(1 − R²) = ${ltShort(Math.sqrt(1 - f.ancovaR ** 2), 3)} (Borm ir kt., 2007).`;
}
function ancovaEn(f: CompareFacts): string {
  if (!covCount(f.spec) || !f.ancovaR) return "";
  return ` With the covariates correlating R = ${enNum(f.ancovaR, 3)} with the outcome, the effect size was divided by √(1 − R²) = ${enNum(Math.sqrt(1 - f.ancovaR ** 2), 3)} (Borm et al., 2007).`;
}

function describeEn(f: CompareFacts): string {
  const { spec, test } = f;
  const a = `(${sidesEn(test)}, ${alphaEn(f)})`;
  switch (spec.kind) {
    case "means":
      return `The sample size was calculated for an independent-samples t test ${a}. To detect a difference of ${enNum(spec.delta, 3)} units with ${enPct(f.target, 0)} power, assuming a standard deviation of ${enNum(spec.sd, 3)} (Cohen's d = ${enNum(spec.delta / spec.sd)})`;
    case "paired":
      return `The sample size was calculated for a paired t test ${a}. To detect a change of ${enNum(spec.delta, 3)} units with ${enPct(f.target, 0)} power, assuming a standard deviation of the differences of ${enNum(spec.sdDiff, 3)} (Cohen's dz = ${enNum(spec.delta / spec.sdDiff)})`;
    case "props":
      return `The sample size was calculated for comparing two proportions ${a} using the normal approximation of Fleiss. To detect a change from ${enPct(spec.p1, 2)} to ${enPct(spec.p2, 2)}${f.or ? ` (odds ratio ${enNum(f.or)})` : ""} with ${enPct(f.target, 0)} power`;
    case "anova":
      return spec.covariates
        ? `The sample size was calculated for an analysis of covariance (ANCOVA) with ${spec.groups} groups${covEn(f)} (${alphaEn(f)}).${ancovaEn(f)} To reach ${enPct(f.target, 0)} power for an adjusted effect size of Cohen's f = ${enNum(spec.f, 3)}`
        : `The sample size was calculated for a one-way ANOVA with ${spec.groups} groups (${alphaEn(f)}). To reach ${enPct(f.target, 0)} power for an effect size of Cohen's f = ${enNum(spec.f, 3)}`;
    case "corr":
      return `The sample size was calculated for a Pearson correlation ${a}. To detect r = ${enNum(spec.r, 3)} with ${enPct(f.target, 0)} power`;
    case "factorial": {
      const what = spec.effect === "A" ? "the main effect of the first factor" : spec.effect === "B" ? "the main effect of the second factor" : "the interaction";
      return `The sample size was calculated for a two-way ANOVA (${spec.a} × ${spec.b} groups${covEn(f)}), testing ${what} (${alphaEn(f)}).${ancovaEn(f)}${tableEn(f)} To reach ${enPct(f.target, 0)} power for Cohen's f = ${enNum(spec.f, 3)}`;
    }
    case "rm": {
      const what = spec.effect === "within" ? "the effect of time" : spec.effect === "between" ? "the difference between groups" : "the group × time interaction";
      const layout = spec.groups > 1 ? `${spec.groups} groups × ${spec.times} measurements` : `${spec.times} measurements`;
      const eps = spec.eps < 1 && spec.effect !== "between" ? `, nonsphericity correction ε = ${enNum(spec.eps, 3)}` : "";
      return `The sample size was calculated for a repeated measures ANOVA (${layout}), testing ${what} (${alphaEn(f)}; correlation between measurements ρ = ${enNum(spec.rho, 3)}${eps}).${tableEn(f)} To reach ${enPct(f.target, 0)} power for Cohen's f = ${enNum(spec.f, 3)}`;
    }
    case "reg":
      return spec.tested === spec.predictors && spec.r2Base === 0
        ? `The sample size was calculated for a linear regression with ${spec.predictors} predictor${spec.predictors > 1 ? "s" : ""}, testing whether R² differs from zero (${alphaEn(f)}). To reach ${enPct(f.target, 0)} power for R² = ${enPct(spec.r2Gain)} (f² = ${enNum(regF2(spec), 3)})`
        : `The sample size was calculated for a linear regression, testing whether ${spec.tested} added predictor${spec.tested > 1 ? "s increase" : " increases"} R² (${spec.predictors} predictors in total, R² ${enPct(spec.r2Base)} without the added ones; ${alphaEn(f)}). To detect ΔR² = ${enPct(spec.r2Gain)} (f² = ${enNum(regF2(spec), 3)}) with ${enPct(f.target, 0)} power`;
    case "logit": {
      const x =
        spec.x === "binary"
          ? `an odds ratio of ${enNum(spec.or, 3)} (event rate ${enPct(spec.p0)} without the factor, ${enPct(spec.share, 0)} of participants with it)`
          : `an odds ratio of ${enNum(spec.or, 3)} per standard deviation (event rate ${enPct(spec.p0)} at the mean)`;
      const r2 = spec.r2 > 0 ? `, the other predictors explaining R² = ${enPct(spec.r2, 0)} of the factor's variance` : "";
      return `The sample size was calculated for a logistic regression Wald test following Demidenko (2007) with the variance correction ${a}. To detect ${x} with ${enPct(f.target, 0)} power${r2}`;
    }
    case "chisq":
      return `The sample size was calculated for a χ² test of independence (${spec.rows} × ${spec.cols} table, df = ${chisqDf(spec)}, ${alphaEn(f)}).${tableEn(f)} To reach ${enPct(f.target, 0)} power for an effect size of Cohen's w = ${enNum(spec.w, 3)}`;
    case "mcnemar": {
      const c = mcnemarCells(spec);
      return `The sample size was calculated for McNemar's test, as an exact binomial test on the discordant pairs ${a}. To detect a change in the share answering yes from ${enPct(spec.p1)} to ${enPct(spec.p2)} with ${enPct(f.target, 0)} power, assuming ${enPct(spec.disc)} of participants change their answer (yes → no ${enPct(c.yesNo)}, no → yes ${enPct(c.noYes)})`;
    }
  }
}

function needLt(f: CompareFacts): string {
  const total = sum(f.groups);
  // "Reikia" takes the genitive.
  const unit = f.abTest ? ltPlural(total, ["lankytojo", "lankytojų", "lankytojų"]) : ltPlural(total, ["tiriamojo", "tiriamųjų", "tiriamųjų"]);
  const parts = f.groups.length > 1 ? `${f.groups.map(ltInt).join(" + ")} = ${ltInt(total)} ${unit}` : `${ltInt(total)} ${unit}`;
  return `, reikia ${parts} (faktinė galia ${ltPct(f.achieved)}).`;
}

function needEn(f: CompareFacts): string {
  const total = sum(f.groups);
  const unit = f.abTest ? "visitors" : "participants";
  const parts = f.groups.length > 1 ? `${f.groups.map(enInt).join(" + ")} = ${enInt(total)} ${unit}` : `${enInt(total)} ${unit}`;
  return `, ${parts} are required (achieved power ${enPct(f.achieved)}).`;
}

function rCode(f: CompareFacts): { r: string; gpower?: string } {
  const { spec, test, groups } = f;
  const a = rNum(test.alpha);
  const alt = test.sides === 2 ? "two.sided" : "greater";
  const tails = test.sides;
  const note = f.rank ? `\n# Then divide by 0.864 for a rank test: n / 0.864` : "";
  switch (spec.kind) {
    case "means": {
      const d = rNum(spec.delta / spec.sd);
      const gp = `t tests → Means: Difference between two independent means (two groups) → A priori; Tails = ${tails}; d = ${d}; α = ${a}; Power = ${rNum(f.target)}; Allocation ratio N2/N1 = ${rNum(spec.ratio)}.`;
      return spec.ratio === 1
        ? { r: `library(pwr)\npwr.t.test(d = ${d}, power = ${rNum(f.target)}, sig.level = ${a},\n           type = "two.sample", alternative = "${alt}")${note}`, gpower: gp }
        : { r: `library(pwr)\n# Power at the unequal group sizes found here\npwr.t2n.test(n1 = ${groups[0]}, n2 = ${groups[1]}, d = ${d}, sig.level = ${a},\n             alternative = "${alt}")${note}`, gpower: gp };
    }
    case "paired": {
      const d = rNum(spec.delta / spec.sdDiff);
      return {
        r: `library(pwr)\npwr.t.test(d = ${d}, power = ${rNum(f.target)}, sig.level = ${a},\n           type = "paired", alternative = "${alt}")${note}`,
        gpower: `t tests → Means: Difference between two dependent means (matched pairs) → A priori; Tails = ${tails}; dz = ${d}; α = ${a}; Power = ${rNum(f.target)}.`,
      };
    }
    case "props": {
      if (spec.ratio === 1 && test.sides === 2) {
        return { r: `power.prop.test(p1 = ${rNum(spec.p1)}, p2 = ${rNum(spec.p2)}, power = ${rNum(f.target)},\n                sig.level = ${a})` };
      }
      return {
        r: `# Fleiss, normal approximation, ${test.sides}-sided, n2 = k * n1\np1 <- ${rNum(spec.p1)}; p2 <- ${rNum(spec.p2)}; k <- ${rNum(spec.ratio)}\npbar <- (p1 + k * p2) / (1 + k)\na <- qnorm(1 - ${a} / ${test.sides}) * sqrt((1 + 1 / k) * pbar * (1 - pbar))\nb <- qnorm(${rNum(f.target)}) * sqrt(p1 * (1 - p1) + p2 * (1 - p2) / k)\nceiling((a + b)^2 / (p1 - p2)^2)  # n1 = ${groups[0]}`,
      };
    }
    case "anova":
      if (spec.covariates) {
        return {
          r: fSearch(
            `k <- ${spec.groups}; covariates <- ${spec.covariates}; f <- ${rNum(spec.f)}  # f adjusted for the covariates`,
            "N <- k * n",
            "k - 1",
            "N - k - covariates",
            "f^2 * N",
            f,
            "per group",
          ),
          gpower: `F tests → ANCOVA: Fixed effects, main effects and interactions → A priori; f = ${rNum(spec.f)}; α = ${a}; Power = ${rNum(f.target)}; Numerator df = ${spec.groups - 1}; Number of groups = ${spec.groups}; Number of covariates = ${spec.covariates}.`,
        };
      }
      return {
        r: `library(pwr)\npwr.anova.test(k = ${spec.groups}, f = ${rNum(spec.f)}, power = ${rNum(f.target)}, sig.level = ${a})${note}`,
        gpower: `F tests → ANOVA: Fixed effects, omnibus, one-way → A priori; f = ${rNum(spec.f)}; α = ${a}; Power = ${rNum(f.target)}; Number of groups = ${spec.groups}.`,
      };
    case "corr":
      return { r: `library(pwr)\npwr.r.test(r = ${rNum(spec.r)}, power = ${rNum(f.target)}, sig.level = ${a}, alternative = "${alt}")${note}` };
    case "factorial": {
      const cells = spec.a * spec.b;
      const cov = spec.covariates ?? 0;
      const df1 = factorialDf(spec);
      return {
        r: fSearch(`cells <- ${cells}; covariates <- ${cov}; f <- ${rNum(spec.f)}`, "N <- cells * n", String(df1), "N - cells - covariates", "f^2 * N", f, "per cell"),
        gpower: cov
          ? `F tests → ANCOVA: Fixed effects, main effects and interactions → A priori; f = ${rNum(spec.f)}; α = ${a}; Power = ${rNum(f.target)}; Numerator df = ${df1}; Number of groups = ${cells}; Number of covariates = ${cov}.`
          : `F tests → ANOVA: Fixed effects, special, main effects and interactions → A priori; f = ${rNum(spec.f)}; α = ${a}; Power = ${rNum(f.target)}; Numerator df = ${df1}; Number of groups = ${cells}.`,
      };
    }
    case "rm": {
      const head = `k <- ${spec.groups}; m <- ${spec.times}; f <- ${rNum(spec.f)}; rho <- ${rNum(spec.rho)}; eps <- ${rNum(spec.eps)}`;
      const r =
        spec.effect === "between"
          ? fSearch(head, "N <- k * n", "k - 1", "N - k", "f^2 * N * m / (1 + (m - 1) * rho)", f, spec.groups > 1 ? "per group" : "")
          : fSearch(
              head,
              "N <- k * n",
              spec.effect === "within" ? "(m - 1) * eps" : "(k - 1) * (m - 1) * eps",
              "(N - k) * (m - 1) * eps",
              "f^2 * N * m * eps / (1 - rho)",
              f,
              spec.groups > 1 ? "per group" : "",
            );
      const name = spec.effect === "within" ? "Repeated measures, within factors" : spec.effect === "between" ? "Repeated measures, between factors" : "Repeated measures, within-between interaction";
      const eps = spec.effect === "between" ? "" : `; Nonsphericity correction ε = ${rNum(spec.eps)}`;
      return {
        r,
        gpower: `F tests → ANOVA: ${name} → A priori; f = ${rNum(spec.f)}; α = ${a}; Power = ${rNum(f.target)}; Number of groups = ${spec.groups}; Number of measurements = ${spec.times}; Corr among rep measures = ${rNum(spec.rho)}${eps}. Options: effect size as in G*Power 3.0 (the default).`,
      };
    }
    case "reg": {
      const f2 = rNum(regF2(spec));
      if (spec.tested === spec.predictors && spec.r2Base === 0) {
        return {
          r: `library(pwr)\nres <- pwr.f2.test(u = ${spec.predictors}, f2 = ${f2}, power = ${rNum(f.target)}, sig.level = ${a})\nceiling(res$v) + ${spec.predictors} + 1  # N = ${groups[0]}`,
          gpower: `F tests → Linear multiple regression: Fixed model, R² deviation from zero → A priori; f² = ${f2}; α = ${a}; Power = ${rNum(f.target)}; Number of predictors = ${spec.predictors}.`,
        };
      }
      return {
        r: fSearch(`p <- ${spec.predictors}; q <- ${spec.tested}; f2 <- ${f2}`, "N <- n", "q", "N - p - 1", "f2 * N", f, ""),
        gpower: `F tests → Linear multiple regression: Fixed model, R² increase → A priori; f² = ${f2}; α = ${a}; Power = ${rNum(f.target)}; Number of tested predictors = ${spec.tested}; Total number of predictors = ${spec.predictors}.`,
      };
    }
    case "logit": {
      const xLines =
        spec.x === "binary"
          ? [
              `B <- ${rNum(spec.share)}  # share with the factor`,
              "i00 <- (1 - B) * w(0) + B * w(1); i01 <- i11 <- B * w(1); vx <- B * (1 - B)",
              "pbar <- (1 - B) * p0 + B * plogis(b0 + b1)",
            ]
          : [
              "E <- function(g) integrate(function(z) g(z) * dnorm(z), -Inf, Inf)$value",
              "i00 <- E(w); i01 <- E(function(z) z * w(z)); i11 <- E(function(z) z^2 * w(z)); vx <- 1",
              "pbar <- E(function(z) plogis(b0 + b1 * z))",
            ];
      const xDist = spec.x === "binary" ? `X distribution = Binomial; X parm π = ${rNum(spec.share)}` : "X distribution = Normal; X parm μ = 0; X parm σ = 1";
      return {
        r: [
          `# Demidenko (2007), Wald test with the variance correction`,
          `p0 <- ${rNum(spec.p0)}; OR <- ${rNum(spec.or)}; r2 <- ${rNum(spec.r2)}; alpha <- ${a}`,
          "b0 <- qlogis(p0); b1 <- log(OR)",
          "w <- function(z) { p <- plogis(b0 + b1 * z); p * (1 - p) }",
          ...xLines,
          "v1 <- i00 / (i00 * i11 - i01^2); v0 <- 1 / (pbar * (1 - pbar) * vx)",
          `power <- function(n) {`,
          `  z <- qnorm(1 - alpha / ${test.sides}); s <- abs(b1) * sqrt(n * (1 - r2))`,
          `  pnorm((s - z * sqrt(v0)) / sqrt(v1))${test.sides === 2 ? " + pnorm((-s - z * sqrt(v0)) / sqrt(v1))" : ""}`,
          "}",
          `n <- 10; while (power(n) < ${rNum(f.target)}) n <- n + 1`,
          `n  # ${groups[0]}`,
        ].join("\n"),
        gpower: `z tests → Logistic regression → A priori; Tails = ${tails}; Odds ratio = ${rNum(spec.or)}; Pr(Y=1|X=1) H0 = ${rNum(spec.p0)}; α = ${a}; Power = ${rNum(f.target)}; R² other X = ${rNum(spec.r2)}; ${xDist}. Options: Demidenko (2007) with variance correction.`,
      };
    }
    case "chisq":
      return {
        r: `library(pwr)\nceiling(pwr.chisq.test(w = ${rNum(spec.w)}, df = ${chisqDf(spec)}, power = ${rNum(f.target)}, sig.level = ${a})$N)  # ${groups[0]}`,
        gpower: `χ² tests → Goodness-of-fit tests: Contingency tables → A priori; w = ${rNum(spec.w)}; α = ${a}; Power = ${rNum(f.target)}; Df = ${chisqDf(spec)}.`,
      };
    case "mcnemar": {
      const c = mcnemarCells(spec);
      const big = Math.max(c.yesNo, c.noYes);
      const small = Math.min(c.yesNo, c.noYes);
      return {
        r: [
          "# Exact binomial test on the discordant pairs, power summed over their number",
          `disc <- ${rNum(spec.disc)}; pi1 <- ${rNum(big / spec.disc)}; a <- ${a} / ${test.sides}`,
          "power <- function(n) {",
          "  d <- 1:n",
          "  c <- qbinom(a, d, 0.5) - 1",
          "  c <- ifelse(pbinom(c + 1, d, 0.5) <= a, c + 1, c)  # largest c with P(X <= c) <= a",
          `  reject <- ifelse(c < 0, 0, 1 - pbinom(d - c - 1, d, pi1)${test.sides === 2 ? " + pbinom(c, d, pi1)" : ""})`,
          "  sum(dbinom(d, n, disc) * reject)",
          "}",
          `n <- 2; while (power(n) < ${rNum(f.target)}) n <- n + 1`,
          `n  # ${groups[0]}`,
        ].join("\n"),
        gpower: `Exact → Proportions: Inequality, two dependent groups (McNemar) → A priori; Tails = ${tails}; Odds ratio = ${rNum(big / small)}; α = ${a}; Power = ${rNum(f.target)}; Prop discordant pairs = ${rNum(spec.disc)}.`,
      };
    }
  }
}

/** R that walks n upwards until a G*Power-style F test reaches the target power. */
function fSearch(head: string, total: string, df1: string, df2: string, ncp: string, f: CompareFacts, per: string): string {
  return [
    head,
    `alpha <- ${rNum(f.test.alpha)}`,
    "power <- function(n) {",
    `  ${total}; df1 <- ${df1}; df2 <- ${df2}`,
    "  if (df2 <= 0) return(0)",
    `  1 - pf(qf(1 - alpha, df1, df2), df1, df2, ncp = ${ncp})`,
    "}",
    `n <- 2; while (power(n) < ${rNum(f.target)}) n <- n + 1`,
    `n  # ${f.groups[0]}${per ? ` ${per}` : ""}`,
  ].join("\n");
}

export function compareReport(f: CompareFacts): Report {
  return { ...compareParagraph(f), statement: compareStatement(f) };
}

function compareParagraph(f: CompareFacts): Paragraph {
  const rank = f.rank;
  const rankLt = rank ? " Kadangi planuojamas ranginis testas, imtis padidinta pagal blogiausią santykinį efektyvumą (0,864)." : "";
  const rankEn = rank ? " Because a rank test is planned, the sample was inflated by its worst-case relative efficiency (0.864)." : "";
  const total = sum(f.enrolled);
  const dropLt =
    f.dropout > 0
      ? ` Atsižvelgiant į ${ltPct(f.dropout, 0)} numatomą nubyrėjimą, planuojama įtraukti ${ltInt(total)} ${ltPlural(total, ["tiriamąjį", "tiriamuosius", "tiriamųjų"])}.`
      : "";
  const dropEn = f.dropout > 0 ? ` Allowing for ${enPct(f.dropout, 0)} dropout, ${enInt(total)} participants will be enrolled.` : "";
  const refs = compareRefs(f.spec);
  return {
    lt: `${describeLt(f)}${needLt(f)}${rankLt}${dropLt} [Įrašykite, iš kur paimtas efekto dydis: šaltinis, pilotinis tyrimas ar mažiausias prasmingas skirtumas.]`,
    en: `${describeEn(f)}${needEn(f)}${rankEn}${dropEn} [State the source of the assumed effect: a published study, a pilot, or the smallest meaningful difference.]`,
    refs,
    ...rCode(f),
  };
}

// ---- Bioequivalence ----

export interface BeFacts {
  input: BeInput;
  abel: boolean;
  target: number;
  n: number;
  achieved: number;
  dropout: number;
  enrolled: number;
  sims: number;
}

export function beReport(f: BeFacts): Report {
  return { ...beParagraph(f), statement: beStatement(f) };
}

function beParagraph(f: BeFacts): Paragraph {
  const { input, abel } = f;
  const design = DESIGNS[input.design];
  const limitsLt = `${ltShort(input.theta1 * 100)}–${ltShort(input.theta2 * 100)} %`;
  const limitsEn = `${enNum(input.theta1 * 100)}–${enNum(input.theta2 * 100)}%`;
  const dropLt =
    f.dropout > 0
      ? ` Atsižvelgiant į ${ltPct(f.dropout, 0)} numatomą pasitraukimą, planuojama įtraukti ${ltInt(f.enrolled)} ${ltPlural(f.enrolled, ["tiriamąjį", "tiriamuosius", "tiriamųjų"])}.`
      : "";
  const dropEn = f.dropout > 0 ? ` Allowing for ${enPct(f.dropout, 0)} dropout, ${enInt(f.enrolled)} subjects will be dosed.` : "";
  const why = " [Įrašykite CV ir GMR šaltinį.]";
  const whyEn = " [State the source of the assumed CV and GMR.]";
  const a = rNum(input.alpha);
  const ci = enPct(1 - 2 * input.alpha, 0);
  if (abel) {
    return {
      lt: `Imties dydis apskaičiuotas tyrimui (dizainas: ${design.label}), vertinant vidutinį bioekvivalentiškumą su išplečiamomis ribomis pagal EMA (ABEL; ribos plečiamos, kai CVwR > 30 %, iki 69,84–143,19 %, kai CVwR ≥ 50 %; taškinis įvertis turi likti 80–125 % ribose). Laikyta, kad intrasubjektinis CV = ${ltPct(input.cv)}, tikrasis T/R santykis = ${ltShort(input.theta0, 4)}, α = ${ltShort(input.alpha, 3)}. Galia įvertinta ${ltInt(f.sims)} simuliacijų: siekiant ${ltPct(f.target, 0)} galios, reikia ${ltInt(f.n)} ${ltPlural(f.n, ["tiriamojo", "tiriamųjų", "tiriamųjų"])} (faktinė galia ${ltPct(f.achieved)}).${dropLt}${why}`,
      en: `The sample size was calculated for a ${input.design} design, assessing average bioequivalence with expanding limits as per the EMA (ABEL; limits widen for CVwR > 30%, up to 69.84–143.19% at CVwR ≥ 50%, with the point estimate constrained to 80–125%). Assuming an intra-subject CV of ${enPct(input.cv)}, a true T/R ratio of ${enNum(input.theta0, 4)} and α = ${enNum(input.alpha, 3)}, power was estimated with ${enInt(f.sims)} simulations: ${enInt(f.n)} subjects are required for ${enPct(f.target, 0)} power (achieved ${enPct(f.achieved)}).${dropEn}${whyEn}`,
      refs: [REF.ema, REF.powertost],
      r: `library(PowerTOST)\nsampleN.scABEL(CV = ${rNum(input.cv)}, theta0 = ${rNum(input.theta0)}, targetpower = ${rNum(f.target)},\n               alpha = ${a}, design = "${input.design}", regulator = "EMA")`,
    };
  }
  return {
    lt: `Imties dydis apskaičiuotas tyrimui (dizainas: ${design.label}), vertinant vidutinį bioekvivalentiškumą dviem vienpusiais testais (TOST), tiksliu galios skaičiavimu (Owen Q funkcijos). Laikyta, kad intrasubjektinis CV = ${ltPct(input.cv)}, tikrasis T/R santykis = ${ltShort(input.theta0, 4)}, bioekvivalentiškumo ribos ${limitsLt}, α = ${ltShort(input.alpha, 3)} (${ltPct(1 - 2 * input.alpha, 0)} PI). Siekiant ${ltPct(f.target, 0)} galios, reikia ${ltInt(f.n)} ${ltPlural(f.n, ["tiriamojo", "tiriamųjų", "tiriamųjų"])} (faktinė galia ${ltPct(f.achieved)}).${dropLt}${why}`,
    en: `The sample size was calculated for a ${input.design} design, assessing average bioequivalence with the two one-sided tests procedure (TOST) using exact power based on Owen's Q function. Assuming an intra-subject CV of ${enPct(input.cv)}, a true T/R ratio of ${enNum(input.theta0, 4)}, acceptance limits of ${limitsEn} and α = ${enNum(input.alpha, 3)} (${ci} CI), ${enInt(f.n)} subjects are required for ${enPct(f.target, 0)} power (achieved ${enPct(f.achieved)}).${dropEn}${whyEn}`,
    refs: [REF.schuirmann, REF.powertost, REF.ema],
    r: `library(PowerTOST)\nsampleN.TOST(CV = ${rNum(input.cv)}, theta0 = ${rNum(input.theta0)}, theta1 = ${rNum(input.theta1)}, theta2 = ${rNum(input.theta2)},\n             targetpower = ${rNum(f.target)}, alpha = ${a}, design = "${input.design}")`,
  };
}

// ---- One-sentence statements ----
// The short, formal version shown under the answer: the number, the inputs that
// produce it and an author–year citation, ready to paste into a results or methods
// section. The full paragraph adds the reasoning and placeholders.

type Statement = Report["statement"];

const RESPONDENTS: [string, string, string] = ["respondentas", "respondentai", "respondentų"];

type Side = { n: string; params: string[]; cite: string };

function sentence(lt: Side, en: Side): Statement {
  return {
    lt: `Reikiamas imties dydis – ${lt.n} (${lt.params.join(", ")}; ${lt.cite}).`,
    en: `The required sample size was ${en.n} (${en.params.join(", ")}; ${en.cite}).`,
  };
}

function surveyStatement(f: SurveyFacts): Statement {
  const paniotto = f.formula === "paniotto";
  const several = f.estimates && f.estimates.length > 1 ? f.estimates : null;
  const each = f.strata?.each ? f.strata : null;
  const hasMean = f.measure === "mean" || (several?.some((e) => e.kind === "mean") ?? false);
  const lt: string[] = [];
  const en: string[] = [];
  if (paniotto) {
    lt.push("Paniotto formulė");
    en.push("Yamane's formula");
  }
  if (each) {
    lt.push(`${each.ns.map(ltInt).join(" + ")}, kiekvienai iš ${each.sizes.length} grupių atskirai`);
    en.push(`${each.ns.map(enInt).join(" + ")}, each of ${each.sizes.length} groups sized separately`);
  } else if (f.population !== null) {
    lt.push(`N = ${ltInt(f.population)}`);
    en.push(`N = ${enInt(f.population)}`);
  }
  if (!paniotto || hasMean) {
    lt.push(`patikimumo lygis ${ltPct(f.confidence, 0)}${f.joint ? ` su Bonferroni pataisa ${f.joint} rodikliams` : ""}`);
    en.push(`${enPct(f.confidence, 0)} confidence level${f.joint ? `, Bonferroni-corrected for ${f.joint} estimates` : ""}`);
  }
  if (several) {
    const driver = several.reduce((a, b) => (b.n > a.n ? b : a));
    lt.push(`pagal reikliausią iš ${several.length} rodiklių („${driver.name}“)`);
    en.push(`set by the most demanding of ${several.length} estimates ("${driver.name}")`);
  } else if (f.measure === "mean") {
    lt.push(`paklaida ±${ltShort(f.margin, 3)}`, `SD ${ltShort(f.sd, 3)}`);
    en.push(`margin of error ±${enNum(f.margin, 3)}`, `SD ${enNum(f.sd, 3)}`);
  } else {
    lt.push(`paklaida ±${ltPct(f.margin)}`);
    en.push(`margin of error ±${enPct(f.margin)}`);
    if (!paniotto) {
      lt.push(`tikėtina dalis ${ltPct(f.p)}`);
      en.push(`expected proportion ${enPct(f.p)}`);
    }
  }
  if (f.deff > 1) {
    lt.push(`dizaino efektas ${ltShort(f.deff)}`);
    en.push(`design effect ${enNum(f.deff)}`);
  }
  const cite = paniotto ? (hasMean ? "Yamane, 1967; Cochran, 1977" : "Yamane, 1967") : "Cochran, 1977";
  return sentence(
    { n: `${ltInt(f.n)} ${ltPlural(f.n, RESPONDENTS)}`, params: lt, cite },
    { n: `${enInt(f.n)} respondents`, params: en, cite },
  );
}

function achievedStatement(f: AchievedFacts): Statement {
  const several = f.estimates.length > 1;
  const mLt = (e: AchievedFacts["estimates"][number]) => (e.kind === "share" ? `±${ltPct(e.reached)}` : `±${ltShort(e.reached, 3)}`);
  const mEn = (e: AchievedFacts["estimates"][number]) => (e.kind === "share" ? `±${enPct(e.reached)}` : `±${enNum(e.reached, 3)}`);
  const e0 = f.estimates[0];
  const itemsLt = several
    ? `paklaidos: ${f.estimates.map((e) => `${e.name} ${mLt(e)}`).join("; ")}`
    : `${e0.kind === "share" ? "dalies" : "vidurkio"} įverčio paklaida ${mLt(e0)}`;
  const itemsEn = several
    ? `the margins of error were ${f.estimates.map((e) => `${mEn(e)} (${e.name})`).join(", ")}`
    : `the margin of error for the ${e0.kind === "share" ? "proportion" : "mean"} was ${mEn(e0)}`;
  const popLt = f.population === null ? "" : `N = ${ltInt(f.population)}, `;
  const popEn = f.population === null ? "" : `N = ${enInt(f.population)}, `;
  const bonfLt = f.joint ? ` su Bonferroni pataisa ${f.joint} rodikliams` : "";
  const bonfEn = f.joint ? `, Bonferroni-corrected for ${f.joint} estimates` : "";
  return {
    lt: `Gauta ${ltInt(f.got)} ${answersLt(f.got)} (${popLt}atsako dažnis ${ltPct(f.responseRate, 0)}); esant ${ltPct(f.confidence, 0)} patikimumo lygiui${bonfLt}, ${itemsLt} (Cochran, 1977).`,
    en: `${enInt(f.got)} completed questionnaires were received (${popEn}response rate ${enPct(f.responseRate, 0)}); at a ${enPct(f.confidence, 0)} confidence level${bonfEn}, ${itemsEn} (Cochran, 1977).`,
  };
}

function compareStatement(f: CompareFacts): Statement {
  const { spec, test } = f;
  const total = sum(f.groups);
  const enrolled = sum(f.enrolled);
  const lt: string[] = [];
  const en: string[] = [];
  if (f.groups.length > 1) {
    lt.push(f.groups.map(ltInt).join(" + "));
    en.push(f.groups.map(enInt).join(" + "));
  }
  switch (spec.kind) {
    case "means":
      lt.push("dviejų nepriklausomų grupių t testas", `Cohen d = ${ltShort(spec.delta / spec.sd, 3)}`);
      en.push("independent-samples t test", `Cohen's d = ${enNum(spec.delta / spec.sd, 3)}`);
      break;
    case "paired":
      lt.push("priklausomų imčių t testas", `Cohen dz = ${ltShort(spec.delta / spec.sdDiff, 3)}`);
      en.push("paired t test", `Cohen's dz = ${enNum(spec.delta / spec.sdDiff, 3)}`);
      break;
    case "props":
      lt.push(
        `${f.abTest ? "A/B testas, konversija" : "dviejų proporcijų palyginimas,"} ${ltPct(spec.p1, 2)} ir ${ltPct(spec.p2, 2)}${f.or ? `, šansų santykis ${ltShort(f.or)}` : ""}`,
      );
      en.push(
        `${f.abTest ? "A/B test, conversion" : "comparison of two proportions,"} ${enPct(spec.p1, 2)} vs ${enPct(spec.p2, 2)}${f.or ? `, odds ratio ${enNum(f.or)}` : ""}`,
      );
      break;
    case "anova":
      lt.push(`${spec.covariates ? "ANCOVA" : "vienfaktorė ANOVA"}, ${spec.groups} grupės${covLt(f)}`, `Cohen f = ${ltShort(spec.f, 3)}`);
      en.push(`${spec.covariates ? "ANCOVA" : "one-way ANOVA"}, ${spec.groups} groups${covEn(f)}`, `Cohen's f = ${enNum(spec.f, 3)}`);
      break;
    case "corr":
      lt.push("Pirsono koreliacija", `r = ${ltShort(spec.r, 3)}`);
      en.push("Pearson correlation", `r = ${enNum(spec.r, 3)}`);
      break;
    case "factorial": {
      const effLt = spec.effect === "A" ? "pirmo veiksnio efektas" : spec.effect === "B" ? "antro veiksnio efektas" : "sąveika";
      const effEn = spec.effect === "A" ? "main effect of the first factor" : spec.effect === "B" ? "main effect of the second factor" : "interaction";
      lt.push(`dvifaktorė ${spec.covariates ? "ANCOVA" : "ANOVA"} ${spec.a} × ${spec.b}${covLt(f)}, ${effLt}`, `Cohen f = ${ltShort(spec.f, 3)}`);
      en.push(`two-way ${spec.covariates ? "ANCOVA" : "ANOVA"} ${spec.a} × ${spec.b}${covEn(f)}, ${effEn}`, `Cohen's f = ${enNum(spec.f, 3)}`);
      break;
    }
    case "rm": {
      const effLt = spec.effect === "within" ? "laiko efektas" : spec.effect === "between" ? "grupių skirtumas" : "grupės × laiko sąveika";
      const effEn = spec.effect === "within" ? "effect of time" : spec.effect === "between" ? "group difference" : "group × time interaction";
      const layoutLt = spec.groups > 1 ? `${spec.groups} grupės × ${spec.times} matavimai` : `${spec.times} matavimai`;
      const layoutEn = spec.groups > 1 ? `${spec.groups} groups × ${spec.times} measurements` : `${spec.times} measurements`;
      const eps = spec.eps < 1 && spec.effect !== "between";
      lt.push(`pakartotinių matavimų ANOVA, ${layoutLt}, ${effLt}`, `Cohen f = ${ltShort(spec.f, 3)}`, `ρ = ${ltShort(spec.rho, 3)}`, ...(eps ? [`ε = ${ltShort(spec.eps, 3)}`] : []));
      en.push(`repeated measures ANOVA, ${layoutEn}, ${effEn}`, `Cohen's f = ${enNum(spec.f, 3)}`, `ρ = ${enNum(spec.rho, 3)}`, ...(eps ? [`ε = ${enNum(spec.eps, 3)}`] : []));
      break;
    }
    case "reg":
      if (spec.tested === spec.predictors && spec.r2Base === 0) {
        lt.push(`tiesinė regresija, ${spec.predictors} ${ltPlural(spec.predictors, ["kintamasis", "kintamieji", "kintamųjų"])}`, `R² = ${ltPct(spec.r2Gain)}`, `f² = ${ltShort(regF2(spec), 3)}`);
        en.push(`linear regression, ${spec.predictors} predictor${spec.predictors > 1 ? "s" : ""}`, `R² = ${enPct(spec.r2Gain)}`, `f² = ${enNum(regF2(spec), 3)}`);
      } else {
        lt.push(`tiesinė regresija, ${spec.tested} nauji iš ${spec.predictors} kintamųjų`, `R² be jų ${ltPct(spec.r2Base)}`, `ΔR² = ${ltPct(spec.r2Gain)}`, `f² = ${ltShort(regF2(spec), 3)}`);
        en.push(`linear regression, ${spec.tested} added of ${spec.predictors} predictors`, `R² without them ${enPct(spec.r2Base)}`, `ΔR² = ${enPct(spec.r2Gain)}`, `f² = ${enNum(regF2(spec), 3)}`);
      }
      break;
    case "logit":
      lt.push(
        `logistinė regresija, ${spec.x === "binary" ? `dvireikšmis veiksnys (${ltPct(spec.share, 0)} turi)` : "skaitinis veiksnys, OR 1 SD"}`,
        `OR = ${ltShort(spec.or, 3)}`,
        `įvykio dalis ${ltPct(spec.p0)}${spec.x === "binary" ? " be veiksnio" : " ties vidurkiu"}`,
        ...(spec.r2 > 0 ? [`R² su kitais kintamaisiais ${ltPct(spec.r2, 0)}`] : []),
      );
      en.push(
        `logistic regression, ${spec.x === "binary" ? `binary factor (${enPct(spec.share, 0)} exposed)` : "numeric factor, OR per SD"}`,
        `OR = ${enNum(spec.or, 3)}`,
        `event rate ${enPct(spec.p0)}${spec.x === "binary" ? " without the factor" : " at the mean"}`,
        ...(spec.r2 > 0 ? [`R² with other predictors ${enPct(spec.r2, 0)}`] : []),
      );
      break;
    case "chisq":
      lt.push(`χ² testas, ${spec.rows} × ${spec.cols} lentelė`, `Cohen w = ${ltShort(spec.w, 3)}`);
      en.push(`χ² test, ${spec.rows} × ${spec.cols} table`, `Cohen's w = ${enNum(spec.w, 3)}`);
      break;
    case "mcnemar":
      lt.push(`McNemar testas, „taip“ ${ltPct(spec.p1)} ir ${ltPct(spec.p2)}`, `pakeičia ${ltPct(spec.disc)}`);
      en.push(`McNemar's test, yes ${enPct(spec.p1)} vs ${enPct(spec.p2)}`, `${enPct(spec.disc)} change their answer`);
      break;
  }
  if (!["anova", "factorial", "rm", "reg", "chisq"].includes(spec.kind)) {
    lt.push(sidesLt(test));
    en.push(sidesEn(test));
  }
  lt.push(f.comparisons > 1 ? `α = ${ltShort(f.alphaPlain, 3)} / ${f.comparisons}` : `α = ${ltShort(test.alpha, 3)}`);
  en.push(f.comparisons > 1 ? `α = ${enNum(f.alphaPlain, 3)} / ${f.comparisons}` : `α = ${enNum(test.alpha, 3)}`);
  lt.push(`galia ${ltPct(f.target, 0)}`);
  en.push(`power ${enPct(f.target, 0)}`);
  if (f.rank) {
    lt.push("+16 % ranginiam testui");
    en.push("+16% for a rank-based test");
  }
  if (f.dropout > 0) {
    lt.push(`įtraukiama ${ltInt(enrolled)}, įvertinus ${ltPct(f.dropout, 0)} nubyrėjimą`);
    en.push(`${enInt(enrolled)} to be enrolled allowing for ${enPct(f.dropout, 0)} dropout`);
  }
  const unitLt = f.abTest
    ? ltPlural(total, ["lankytojas", "lankytojai", "lankytojų"])
    : spec.kind === "paired"
      ? ltPlural(total, ["pora", "poros", "porų"])
      : ltPlural(total, ["tiriamasis", "tiriamieji", "tiriamųjų"]);
  const unitEn = f.abTest ? "visitors" : spec.kind === "paired" ? "pairs" : "participants";
  const cite = compareCite(spec);
  return sentence({ n: `${ltInt(total)} ${unitLt}`, params: lt, cite: cite.lt }, { n: `${enInt(total)} ${unitEn}`, params: en, cite: cite.en });
}

function beStatement(f: BeFacts): Statement {
  const { input, abel } = f;
  const label = DESIGNS[input.design].label;
  const lt = [label.charAt(0).toLowerCase() + label.slice(1)];
  const en = [`${input.design} design`];
  if (abel) {
    lt.push("ABEL pagal EMA", `CVwR ${ltPct(input.cv)}`);
    en.push("ABEL as per the EMA", `CVwR ${enPct(input.cv)}`);
  } else {
    lt.push("TOST", `CV ${ltPct(input.cv)}`);
    en.push("TOST", `CV ${enPct(input.cv)}`);
  }
  lt.push(`GMR ${ltShort(input.theta0 * 100)}\u00a0%`);
  en.push(`GMR ${enNum(input.theta0 * 100)}%`);
  if (!abel) {
    lt.push(`ribos ${ltShort(input.theta1 * 100)}–${ltShort(input.theta2 * 100)}\u00a0%`);
    en.push(`limits ${enNum(input.theta1 * 100)}–${enNum(input.theta2 * 100)}%`);
  }
  lt.push(`α = ${ltShort(input.alpha, 3)}`, `galia ${ltPct(f.target, 0)}`);
  en.push(`α = ${enNum(input.alpha, 3)}`, `power ${enPct(f.target, 0)}`);
  if (abel) {
    lt.push(`${ltInt(f.sims)} simuliacijų`);
    en.push(`${enInt(f.sims)} simulations`);
  }
  if (f.dropout > 0) {
    lt.push(`dozuojama ${ltInt(f.enrolled)}, įvertinus ${ltPct(f.dropout, 0)} pasitraukimą`);
    en.push(`${enInt(f.enrolled)} to be dosed allowing for ${enPct(f.dropout, 0)} dropout`);
  }
  const cite = abel ? "EMA, 2010" : "Schuirmann, 1987";
  return sentence(
    { n: `${ltInt(f.n)} ${ltPlural(f.n, ["vertinamas tiriamasis", "vertinami tiriamieji", "vertinamų tiriamųjų"])}`, params: lt, cite },
    { n: `${enInt(f.n)} evaluable subjects`, params: en, cite },
  );
}
