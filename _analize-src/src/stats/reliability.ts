// Internal consistency of a scale: Cronbach's α with item–total statistics.
import type { AnalysisResult, AssumptionCheck, Dataset, TestDefinition } from "../types";
import { fmt, ltPlural } from "./format";
import { getVar, mean, variance } from "./helpers";
import { pearson } from "./correlations";
import { newStepId } from "../data/prep";

/** Rows where every item has a numeric value (listwise deletion, as SPSS RELIABILITY). */
function completeItems(ds: Dataset, keys: string[]): number[][] {
  const out: number[][] = [];
  for (const row of ds.rows) {
    const vals: number[] = [];
    for (const k of keys) {
      const v = row[k];
      if (v === null || v === undefined || v === "") break;
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isNaN(n)) break;
      vals.push(n);
    }
    if (vals.length === keys.length) out.push(vals);
  }
  return out;
}

export function cronbachAlpha(data: number[][]): number {
  const k = data[0].length;
  const itemVar = Array.from({ length: k }, (_, j) => variance(data.map((r) => r[j])));
  const totalVar = variance(data.map((r) => r.reduce((a, b) => a + b, 0)));
  return (k / (k - 1)) * (1 - itemVar.reduce((a, b) => a + b, 0) / totalVar);
}

/** George & Mallery (2003) rule of thumb, phrased for the description. */
function alphaVerdict(a: number): string {
  if (a >= 0.9) return "puikus";
  if (a >= 0.8) return "geras";
  if (a >= 0.7) return "priimtinas";
  if (a >= 0.6) return "abejotinas";
  if (a >= 0.5) return "prastas";
  return "nepriimtinas";
}

export const cronbach: TestDefinition = {
  id: "cronbach",
  name: "Skalės patikimumas (Cronbacho α)",
  blurb: "Ar skalės teiginiai matuoja tą patį? Cronbacho α, teiginio ir skalės koreliacijos bei α pašalinus teiginį.",
  methods:
    "Skalių vidiniam suderinamumui įvertinti apskaičiuoti Cronbacho alfa (α) koeficientai; α ≥ 0,70 laikytas priimtinu.",
  apa: "Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests. Psychometrika, 16(3), 297–334. https://doi.org/10.1007/BF02310555",
  guide: {
    title: "Kaip apskaičiuoti Cronbacho alfa (α)?",
    url: "https://statistikas.lt/posts/kaip-apskaiciuoti-cronbacho-alfa/kaip-apskaiciuoti-cronbacho-alfa.html",
  },
  inputs: [{ id: "items", label: "Skalės teiginiai (2 ar daugiau)", accepts: "any", multi: true }],
  run: (ds, picks): AnalysisResult => {
    const keys = (picks.items ?? "").split(",").filter(Boolean);
    if (keys.length < 2) throw new Error("Pasirinkite bent du skalės teiginius.");
    const vars = keys.map((k) => getVar(ds, k));
    const data = completeItems(ds, keys);
    const n = data.length;
    if (n < 3) throw new Error(`Per mažai respondentų, atsakiusių į visus teiginius (n = ${n}).`);
    const k = keys.length;
    const alpha = cronbachAlpha(data);

    // Standardised α from the mean inter-item correlation.
    const cols = keys.map((_, j) => data.map((r) => r[j]));
    let rSum = 0;
    let rCount = 0;
    for (let i = 0; i < k; i++)
      for (let j = 0; j < i; j++) {
        rSum += pearson(cols[i], cols[j]);
        rCount++;
      }
    const rBar = rSum / rCount;
    const alphaStd = (k * rBar) / (1 + (k - 1) * rBar);

    const items = keys.map((key, j) => {
      const rest = data.map((r) => r.reduce((a, b) => a + b, 0) - r[j]);
      const rDrop = pearson(cols[j], rest);
      const alphaDrop = k > 2 ? cronbachAlpha(data.map((r) => r.filter((_, c) => c !== j))) : NaN;
      return { key, label: vars[j].label, m: mean(cols[j]), s: Math.sqrt(variance(cols[j])), rDrop, alphaDrop };
    });

    const stats: Record<string, number> = { alpha, alphaStd, n, k, rBar };
    for (const it of items) {
      stats[`rDrop_${it.key}`] = it.rDrop;
      if (k > 2) stats[`alphaDrop_${it.key}`] = it.alphaDrop;
    }

    // Observed scale range, used for the one-click reverse-coding remedy.
    const flat = data.flat();
    const lo = Math.min(...flat);
    const hi = Math.max(...flat);

    const checks: AssumptionCheck[] = [];
    const negative = items.filter((it) => it.rDrop < 0);
    for (const it of negative) {
      checks.push({
        label: `Neigiama koreliacija: ${it.key}`,
        status: "fail",
        detail:
          `Teiginio „${it.label}“ koreliacija su likusia skale neigiama (r = ${fmt(it.rDrop)}) – ` +
          `tikėtina, kad jis suformuluotas atvirkščiai ir turi būti perkoduotas prieš skaičiuojant α.`,
        addPrep: {
          label: `Perkoduoti „${it.key}“ atvirkščiai (${fmt(lo)}–${fmt(hi)})`,
          step: { kind: "reverse", id: newStepId(), variables: [it.key], min: lo, max: hi },
        },
      });
    }
    const weak = items.filter((it) => it.rDrop >= 0 && it.rDrop < 0.3);
    if (weak.length > 0) {
      checks.push({
        label: "Silpnai susiję teiginiai",
        status: "warn",
        detail:
          `${weak.map((it) => it.key).join(", ")}: teiginio ir skalės koreliacija < 0,30. ` +
          `Apsvarstykite, ar ${weak.length === 1 ? "šis teiginys matuoja" : "šie teiginiai matuoja"} tą patį konstruktą.`,
      });
    }
    if (k === 2) {
      checks.push({
        label: "Tik du teiginiai",
        status: "warn",
        detail: "Dviejų teiginių skalei α yra mažai informatyvus – vietoje jo dažnai pateikiama teiginių koreliacija.",
      });
    }
    if (checks.length === 0) {
      checks.push({
        label: "Teiginių ir skalės koreliacijos",
        status: "pass",
        detail: "Visų teiginių koreliacija su likusia skale ≥ 0,30 – teiginiai dera tarpusavyje.",
      });
    }

    const best = items.filter((it) => it.alphaDrop > alpha + 0.01).sort((a, b) => b.alphaDrop - a.alphaDrop)[0];
    return {
      stats,
      assumptions: checks,
      description:
        `Skalės iš ${k} ${ltPlural(k, ["teiginio", "teiginių", "teiginių"])} vidinis suderinamumas (n = ${n}) yra ` +
        `${alphaVerdict(alpha)}: Cronbacho α = ${fmt(alpha)} (standartizuotas α = ${fmt(alphaStd)}; ` +
        `vidutinė teiginių tarpusavio koreliacija ${fmt(rBar)}).` +
        (best
          ? ` Pašalinus teiginį „${best.label}“, α padidėtų iki ${fmt(best.alphaDrop)}.`
          : " Pašalinus bet kurį teiginį, α reikšmingai nepadidėtų."),
      tables: [
        {
          title: "Patikimumo statistika",
          columns: ["Cronbacho α", "Standartizuotas α", "Teiginių skaičius", "N"],
          rows: [[fmt(alpha), fmt(alphaStd), k, n]],
        },
        {
          title: "Teiginių ir skalės statistika",
          columns: ["Teiginys", "Vidurkis", "SN", "Pataisyta teiginio ir skalės koreliacija", "α pašalinus teiginį"],
          rows: items.map((it) => [it.label, fmt(it.m), fmt(it.s), fmt(it.rDrop), k > 2 ? fmt(it.alphaDrop) : "—"]),
          note: "Pataisyta koreliacija – teiginio koreliacija su likusių teiginių suma.",
        },
      ],
      plot: {
        kind: "bar",
        title: "Teiginių koreliacija su likusia skale",
        xLabel: "Teiginys",
        yLabel: "Koreliacija",
        series: [{ label: "r", values: items.map((it) => ({ x: it.key, y: Number(it.rDrop.toFixed(3)) })) }],
      },
    };
  },
};
