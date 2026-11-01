// The paragraph for a methods section (Lithuanian and English), its references and
// the code that reproduces the number. Published sample size calculations are rarely
// reproducible because inputs go unreported, so every input is spelled out here.

import { DESIGNS, type BeInput } from "./engine/be";
import type { Spec, Test } from "./engine/compare";
import { enInt, enNum, enPct, fmtInt, fmtPct, fmtShort, ltPlural, rNum } from "./format";

export interface Report {
  lt: string;
  en: string;
  refs: string[];
  r: string;
  gpower?: string;
}

const REF = {
  cochran: "Cochran WG. Sampling Techniques. 3rd ed. New York: Wiley; 1977.",
  yamane: "Yamane T. Statistics: An Introductory Analysis. 2nd ed. New York: Harper & Row; 1967.",
  cohen: "Cohen J. Statistical Power Analysis for the Behavioral Sciences. 2nd ed. Hillsdale, NJ: Erlbaum; 1988.",
  fleiss: "Fleiss JL, Levin B, Paik MC. Statistical Methods for Rates and Proportions. 3rd ed. Hoboken, NJ: Wiley; 2003.",
  schuirmann:
    "Schuirmann DJ. A comparison of the two one-sided tests procedure and the power approach for assessing the equivalence of average bioavailability. J Pharmacokinet Biopharm. 1987;15(6):657–680.",
  powertost: "Labes D, Schütz H, Lang B. PowerTOST: Power and Sample Size for (Bio)Equivalence Studies. R package.",
  ema: "European Medicines Agency. Guideline on the Investigation of Bioequivalence. CPMP/EWP/QWP/1401/98 Rev. 1/Corr**. London: EMA; 2010.",
};

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
}

const WHY_LT = " [Įrašykite, kodėl pasirinkta ši paklaida ir kaip bus atrenkami respondentai.]";
const WHY_EN = " [State why this margin was chosen and how respondents will be selected.]";

function responseText(f: SurveyFacts): { lt: string; en: string } {
  return f.possible
    ? {
        lt: ` Tikintis ${fmtPct(f.responseRate, 0)} atsako dažnio, numatyta išdalyti ${fmtInt(f.send)} ${ltPlural(f.send, ["anketą", "anketas", "anketų"])}.`,
        en: ` Assuming a ${enPct(f.responseRate, 0)} response rate, ${enInt(f.send)} questionnaires will be distributed.`,
      }
    : {
        lt: ` Numatyta apklausti visą generalinę visumą; tikintis ${fmtPct(f.responseRate, 0)} atsako dažnio, laukiama ${fmtInt(f.expectedAnswers)} ${ltPlural(f.expectedAnswers, ["atsakymo", "atsakymų", "atsakymų"])}.`,
        en: ` The whole population will be invited; assuming a ${enPct(f.responseRate, 0)} response rate, ${enInt(f.expectedAnswers)} responses are expected.`,
      };
}

/** Each group sized on its own: the population-wide formula would not give this n. */
function perGroupReport(f: SurveyFacts, strata: NonNullable<SurveyFacts["strata"]>): Report {
  const k = strata.sizes.length;
  const send = responseText(f);
  const parts = strata.ns.map(fmtInt).join(" + ");
  const partsEn = strata.ns.map(enInt).join(" + ");
  const paniotto = f.formula === "paniotto";
  const mean = f.measure === "mean";
  const methodLt = paniotto
    ? `Paniotto formulę n = 1 / (Δ² + 1/N), kai Δ = ${fmtShort(f.margin, 3)}`
    : `Cochran formulę su baigtinės populiacijos pataisa (patikimumo lygis ${fmtPct(f.confidence, 0)}, leistina paklaida ±${mean ? fmtShort(f.margin, 3) : fmtPct(f.margin)}, ${mean ? `standartinis nuokrypis ${fmtShort(f.sd, 3)}` : `tikėtina požymio dalis ${fmtPct(f.p)}`})`;
  const methodEn = paniotto
    ? `Yamane's formula, n = N / (1 + Ne²), with e = ${enNum(f.margin, 3)}`
    : `Cochran's formula with a finite population correction (${enPct(f.confidence, 0)} confidence level, margin of error ±${mean ? enNum(f.margin, 3) : enPct(f.margin)}, ${mean ? `standard deviation ${enNum(f.sd, 3)}` : `expected proportion ${enPct(f.p)}`})`;
  const N = `N <- c(${strata.sizes.map(rNum).join(", ")})`;
  const z = `z <- qnorm(1 - ${rNum((1 - f.confidence) / 2)})`;
  const variance = mean ? `${rNum(f.sd)}^2` : `${rNum(f.p)} * (1 - ${rNum(f.p)})`;
  return {
    lt: `Imties dydis apskaičiuotas atskirai kiekvienai iš ${k} grupių pagal ${methodLt}, kad grupes būtų galima lyginti. Iš viso reikia n = ${parts} = ${fmtInt(f.n)} ${ltPlural(f.n, ["užpildytos anketos", "užpildytų anketų", "užpildytų anketų"])}.${send.lt}${WHY_LT}`,
    en: `The sample size was calculated separately for each of the ${k} groups with ${methodEn}, so that the groups can be compared: n = ${partsEn} = ${enInt(f.n)} completed questionnaires in total.${send.en}${WHY_EN}`,
    refs: [paniotto ? REF.yamane : REF.cochran],
    r: paniotto
      ? `${N}; e <- ${rNum(f.margin)}\nsum(ceiling(1 / (e^2 + 1 / N)))  # ${f.n}`
      : `${N}; E <- ${rNum(f.margin)}; deff <- ${rNum(f.deff)}\n${z}\nn0 <- z^2 * ${variance} * deff / E^2\nsum(ceiling(n0 / (1 + (n0 - 1) / N)))  # ${f.n}`,
  };
}

export function surveyReport(f: SurveyFacts): Report {
  if (f.strata?.each) return perGroupReport(f, f.strata);
  const strata = f.strata
    ? {
        lt: ` Respondentai atrenkami iš ${f.strata.sizes.length} grupių proporcingai jų dydžiui.`,
        en: ` Respondents will be drawn from ${f.strata.sizes.length} strata in proportion to their size.`,
      }
    : { lt: "", en: "" };
  const { lt: sendLt, en: sendEn } = responseText(f);
  const nLt = f.population === null ? "kai generalinė visuma labai didelė" : `kai generalinė visuma N = ${fmtInt(f.population)}`;
  const nEn = f.population === null ? "for a very large population" : `for a population of N = ${enInt(f.population)}`;
  const deffLt = f.deff > 1 ? ` Dėl klasterinės atrankos pritaikytas dizaino efektas ${fmtShort(f.deff)}.` : "";
  const deffEn = f.deff > 1 ? ` A design effect of ${enNum(f.deff)} was applied for cluster sampling.` : "";
  const why = WHY_LT;
  const whyEn = WHY_EN;
  const N = f.population === null ? "Inf" : rNum(f.population);

  if (f.formula === "paniotto") {
    return {
      lt: `Imties dydis apskaičiuotas pagal Paniotto formulę n = 1 / (Δ² + 1/N), ${nLt}, o leistina paklaida Δ = ${fmtShort(f.margin, 3)}: reikia n = ${fmtInt(f.n)} ${ltPlural(f.n, ["užpildytos anketos", "užpildytų anketų", "užpildytų anketų"])}.${sendLt}${strata.lt}${why}`,
      en: `The required sample size was calculated with Yamane's formula, n = N / (1 + Ne²), ${nEn} and a margin of error of e = ${enNum(f.margin, 3)}: n = ${enInt(f.n)} completed questionnaires are needed.${sendEn}${strata.en}${whyEn}`,
      refs: [REF.yamane],
      r: `N <- ${N}; e <- ${rNum(f.margin)}\nceiling(1 / (e^2 + 1 / N))  # ${f.n}`,
    };
  }
  if (f.measure === "mean") {
    return {
      lt: `Imties dydis vidurkiui įvertinti apskaičiuotas pagal Cochran formulę${f.population === null ? "" : " su baigtinės populiacijos pataisa"}: ${nLt}, patikimumo lygis ${fmtPct(f.confidence, 0)}, leistina paklaida ±${fmtShort(f.margin, 3)}, numatomas standartinis nuokrypis ${fmtShort(f.sd, 3)}; reikia n = ${fmtInt(f.n)} ${ltPlural(f.n, ["užpildytos anketos", "užpildytų anketų", "užpildytų anketų"])}.${deffLt}${sendLt}${strata.lt}${why}`,
      en: `The sample size for estimating a mean was calculated with Cochran's formula${f.population === null ? "" : " with a finite population correction"}, ${nEn}, a ${enPct(f.confidence, 0)} confidence level, a margin of error of ±${enNum(f.margin, 3)} and an expected standard deviation of ${enNum(f.sd, 3)}: n = ${enInt(f.n)} completed questionnaires are needed.${deffEn}${sendEn}${strata.en}${whyEn}`,
      refs: [REF.cochran],
      r: `N <- ${N}; E <- ${rNum(f.margin)}; sd <- ${rNum(f.sd)}; deff <- ${rNum(f.deff)}\nz <- qnorm(1 - ${rNum((1 - f.confidence) / 2)})\nn0 <- z^2 * sd^2 * deff / E^2\nceiling(n0 / (1 + (n0 - 1) / N))  # ${f.n}`,
    };
  }
  return {
    lt: `Imties dydis apskaičiuotas pagal Cochran formulę${f.population === null ? "" : " su baigtinės populiacijos pataisa"}: ${nLt}, patikimumo lygis ${fmtPct(f.confidence, 0)}, leistina paklaida ±${fmtPct(f.margin)}, tikėtina požymio dalis ${fmtPct(f.p)}; reikia n = ${fmtInt(f.n)} ${ltPlural(f.n, ["užpildytos anketos", "užpildytų anketų", "užpildytų anketų"])}.${deffLt}${sendLt}${strata.lt}${why}`,
    en: `The required sample size was calculated with Cochran's formula${f.population === null ? "" : " with a finite population correction"}, ${nEn}, a ${enPct(f.confidence, 0)} confidence level, a margin of error of ±${enPct(f.margin)} and an expected proportion of ${enPct(f.p)}: n = ${enInt(f.n)} completed questionnaires are needed.${deffEn}${sendEn}${strata.en}${whyEn}`,
    refs: [REF.cochran],
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
    ? `α = ${fmtShort(f.alphaPlain, 3)}, Bonferroni pataisa ${f.comparisons} palyginimams, t. y. α = ${fmtShort(f.test.alpha, 4)}`
    : `α = ${fmtShort(f.test.alpha, 3)}`;
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
      return `Imties dydis apskaičiuotas dviejų nepriklausomų grupių t testui ${a}. Siekiant ${fmtPct(f.target, 0)} galios aptikti ${fmtShort(spec.delta, 3)} vnt. skirtumą, kai standartinis nuokrypis ${fmtShort(spec.sd, 3)} (Cohen d = ${fmtShort(spec.delta / spec.sd)})`;
    case "paired":
      return `Imties dydis apskaičiuotas priklausomų imčių t testui ${a}. Siekiant ${fmtPct(f.target, 0)} galios aptikti ${fmtShort(spec.delta, 3)} vnt. pokytį, kai skirtumų standartinis nuokrypis ${fmtShort(spec.sdDiff, 3)} (Cohen dz = ${fmtShort(spec.delta / spec.sdDiff)})`;
    case "props":
      return `Imties dydis apskaičiuotas dviejų proporcijų palyginimui ${a}, normaliuoju artiniu pagal Fleiss. Siekiant ${fmtPct(f.target, 0)} galios aptikti ${f.abTest ? "konversijos" : "dalių"} skirtumą nuo ${fmtPct(spec.p1, 2)} iki ${fmtPct(spec.p2, 2)}${f.or ? ` (šansų santykis ${fmtShort(f.or)})` : ""}`;
    case "anova":
      return `Imties dydis apskaičiuotas vienfaktorei dispersinei analizei su ${spec.groups} grupėmis (${alphaLt(f)}). Siekiant ${fmtPct(f.target, 0)} galios, kai efekto dydis Cohen f = ${fmtShort(spec.f, 3)}`;
    case "corr":
      return `Imties dydis apskaičiuotas Pirsono koreliacijai ${a}. Siekiant ${fmtPct(f.target, 0)} galios aptikti koreliaciją r = ${fmtShort(spec.r, 3)}`;
  }
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
      return `The sample size was calculated for a one-way ANOVA with ${spec.groups} groups (${alphaEn(f)}). To reach ${enPct(f.target, 0)} power for an effect size of Cohen's f = ${enNum(spec.f, 3)}`;
    case "corr":
      return `The sample size was calculated for a Pearson correlation ${a}. To detect r = ${enNum(spec.r, 3)} with ${enPct(f.target, 0)} power`;
  }
}

function needLt(f: CompareFacts): string {
  const total = sum(f.groups);
  // "Reikia" takes the genitive.
  const unit = f.abTest ? ltPlural(total, ["lankytojo", "lankytojų", "lankytojų"]) : ltPlural(total, ["tiriamojo", "tiriamųjų", "tiriamųjų"]);
  const parts = f.groups.length > 1 ? `${f.groups.map(fmtInt).join(" + ")} = ${fmtInt(total)} ${unit}` : `${fmtInt(total)} ${unit}`;
  return `, reikia ${parts} (faktinė galia ${fmtPct(f.achieved)}).`;
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
      return {
        r: `library(pwr)\npwr.anova.test(k = ${spec.groups}, f = ${rNum(spec.f)}, power = ${rNum(f.target)}, sig.level = ${a})${note}`,
        gpower: `F tests → ANOVA: Fixed effects, omnibus, one-way → A priori; f = ${rNum(spec.f)}; α = ${a}; Power = ${rNum(f.target)}; Number of groups = ${spec.groups}.`,
      };
    case "corr":
      return { r: `library(pwr)\npwr.r.test(r = ${rNum(spec.r)}, power = ${rNum(f.target)}, sig.level = ${a}, alternative = "${alt}")${note}` };
  }
}

export function compareReport(f: CompareFacts): Report {
  const rank = f.rank;
  const rankLt = rank ? " Kadangi planuojamas ranginis testas, imtis padidinta pagal blogiausią santykinį efektyvumą (0,864)." : "";
  const rankEn = rank ? " Because a rank test is planned, the sample was inflated by its worst-case relative efficiency (0.864)." : "";
  const total = sum(f.enrolled);
  const dropLt =
    f.dropout > 0
      ? ` Atsižvelgiant į ${fmtPct(f.dropout, 0)} numatomą nubyrėjimą, planuojama įtraukti ${fmtInt(total)} ${ltPlural(total, ["tiriamąjį", "tiriamuosius", "tiriamųjų"])}.`
      : "";
  const dropEn = f.dropout > 0 ? ` Allowing for ${enPct(f.dropout, 0)} dropout, ${enInt(total)} participants will be enrolled.` : "";
  const refs = f.spec.kind === "props" ? [REF.fleiss] : [REF.cohen];
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
  const { input, abel } = f;
  const design = DESIGNS[input.design];
  const limitsLt = `${fmtShort(input.theta1 * 100)}–${fmtShort(input.theta2 * 100)} %`;
  const limitsEn = `${enNum(input.theta1 * 100)}–${enNum(input.theta2 * 100)}%`;
  const dropLt =
    f.dropout > 0
      ? ` Atsižvelgiant į ${fmtPct(f.dropout, 0)} numatomą pasitraukimą, planuojama įtraukti ${fmtInt(f.enrolled)} ${ltPlural(f.enrolled, ["tiriamąjį", "tiriamuosius", "tiriamųjų"])}.`
      : "";
  const dropEn = f.dropout > 0 ? ` Allowing for ${enPct(f.dropout, 0)} dropout, ${enInt(f.enrolled)} subjects will be dosed.` : "";
  const why = " [Įrašykite CV ir GMR šaltinį.]";
  const whyEn = " [State the source of the assumed CV and GMR.]";
  const a = rNum(input.alpha);
  const ci = enPct(1 - 2 * input.alpha, 0);
  if (abel) {
    return {
      lt: `Imties dydis apskaičiuotas tyrimui (dizainas: ${design.label}), vertinant vidutinį bioekvivalentiškumą su išplečiamomis ribomis pagal EMA (ABEL; ribos plečiamos, kai CVwR > 30 %, iki 69,84–143,19 %, kai CVwR ≥ 50 %; taškinis įvertis turi likti 80–125 % ribose). Laikyta, kad intrasubjektinis CV = ${fmtPct(input.cv)}, tikrasis T/R santykis = ${fmtShort(input.theta0, 4)}, α = ${fmtShort(input.alpha, 3)}. Galia įvertinta ${fmtInt(f.sims)} simuliacijų: siekiant ${fmtPct(f.target, 0)} galios, reikia ${fmtInt(f.n)} ${ltPlural(f.n, ["tiriamojo", "tiriamųjų", "tiriamųjų"])} (faktinė galia ${fmtPct(f.achieved)}).${dropLt}${why}`,
      en: `The sample size was calculated for a ${input.design} design, assessing average bioequivalence with expanding limits as per the EMA (ABEL; limits widen for CVwR > 30%, up to 69.84–143.19% at CVwR ≥ 50%, with the point estimate constrained to 80–125%). Assuming an intra-subject CV of ${enPct(input.cv)}, a true T/R ratio of ${enNum(input.theta0, 4)} and α = ${enNum(input.alpha, 3)}, power was estimated with ${enInt(f.sims)} simulations: ${enInt(f.n)} subjects are required for ${enPct(f.target, 0)} power (achieved ${enPct(f.achieved)}).${dropEn}${whyEn}`,
      refs: [REF.ema, REF.powertost],
      r: `library(PowerTOST)\nsampleN.scABEL(CV = ${rNum(input.cv)}, theta0 = ${rNum(input.theta0)}, targetpower = ${rNum(f.target)},\n               alpha = ${a}, design = "${input.design}", regulator = "EMA")`,
    };
  }
  return {
    lt: `Imties dydis apskaičiuotas tyrimui (dizainas: ${design.label}), vertinant vidutinį bioekvivalentiškumą dviem vienpusiais testais (TOST), tiksliu galios skaičiavimu (Owen Q funkcijos). Laikyta, kad intrasubjektinis CV = ${fmtPct(input.cv)}, tikrasis T/R santykis = ${fmtShort(input.theta0, 4)}, bioekvivalentiškumo ribos ${limitsLt}, α = ${fmtShort(input.alpha, 3)} (${fmtPct(1 - 2 * input.alpha, 0)} PI). Siekiant ${fmtPct(f.target, 0)} galios, reikia ${fmtInt(f.n)} ${ltPlural(f.n, ["tiriamojo", "tiriamųjų", "tiriamųjų"])} (faktinė galia ${fmtPct(f.achieved)}).${dropLt}${why}`,
    en: `The sample size was calculated for a ${input.design} design, assessing average bioequivalence with the two one-sided tests procedure (TOST) using exact power based on Owen's Q function. Assuming an intra-subject CV of ${enPct(input.cv)}, a true T/R ratio of ${enNum(input.theta0, 4)}, acceptance limits of ${limitsEn} and α = ${enNum(input.alpha, 3)} (${ci} CI), ${enInt(f.n)} subjects are required for ${enPct(f.target, 0)} power (achieved ${enPct(f.achieved)}).${dropEn}${whyEn}`,
    refs: [REF.schuirmann, REF.powertost, REF.ema],
    r: `library(PowerTOST)\nsampleN.TOST(CV = ${rNum(input.cv)}, theta0 = ${rNum(input.theta0)}, theta1 = ${rNum(input.theta1)}, theta2 = ${rNum(input.theta2)},\n             targetpower = ${rNum(f.target)}, alpha = ${a}, design = "${input.design}")`,
  };
}
