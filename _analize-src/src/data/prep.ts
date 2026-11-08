// Data-preparation steps („Duomenų paruošimas“): an ordered, pure pipeline
// raw dataset → step 1 → … → step N → the dataset every analysis block sees.
// The raw data are never mutated; each step also describes itself in a sentence
// for the report's „Duomenų analizė“ paragraph.
import type { Dataset, Variable } from "../types";
import { fmt, ltPlural } from "../stats/format";

export type FilterOp = "==" | "!=" | ">" | ">=" | "<" | "<=";

export type PrepStep =
  | { kind: "reverse"; id: string; variables: string[]; min: number; max: number }
  | {
      kind: "recode";
      id: string;
      variable: string;
      /** Key and label of the new categorical variable. */
      target: string;
      label: string;
      /** Each rule maps a numeric range (inclusive) or an exact value to a group. */
      rules: { from?: number; to?: number; value?: string; group: string }[];
    }
  | {
      kind: "compute";
      id: string;
      target: string;
      label: string;
      items: string[];
      fn: "mean" | "sum";
      /** Minimum answered items for a score; fewer gives a missing score. */
      minValid: number;
    }
  | { kind: "filter"; id: string; variable: string; op: FilterOp; value: string };

export const STEP_KIND_LABEL: Record<PrepStep["kind"], string> = {
  reverse: "Atvirkštinis perkodavimas",
  recode: "Grupavimas (perkodavimas į naują kintamąjį)",
  compute: "Skalės balas (vidurkis ar suma)",
  filter: "Atvejų atranka",
};

const OP_TEXT: Record<FilterOp, string> = {
  "==": "lygi",
  "!=": "nelygi",
  ">": "didesnė nei",
  ">=": "ne mažesnė nei",
  "<": "mažesnė nei",
  "<=": "ne didesnė nei",
};

export interface PrepResult {
  dataset: Dataset;
  /** One methods sentence per step, aligned with the steps ("" for a failed step). */
  sentences: string[];
  /** Per step: an error message, or null if the step applied. */
  errors: (string | null)[];
}

const num = (x: number | string | null | undefined): number | null => {
  if (x === null || x === undefined || x === "") return null;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isNaN(n) ? null : n;
};

/** "K1, K2 ir K3" */
function listLt(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ir ${items[items.length - 1]}`;
}

function varOf(ds: Dataset, key: string): Variable {
  const v = ds.variables.find((x) => x.key === key);
  if (!v) throw new Error(`Kintamasis „${key}“ nerastas.`);
  return v;
}

/** Short name for methods text: the key when the label is a long item wording. */
const shortName = (v: Variable) => (v.label.length > 30 ? v.key : v.label);

function applyStep(ds: Dataset, step: PrepStep): { dataset: Dataset; sentence: string } {
  switch (step.kind) {
    case "reverse": {
      if (step.variables.length === 0) throw new Error("Pasirinkite bent vieną kintamąjį.");
      if (!(step.max > step.min)) throw new Error("Skalės maksimumas turi būti didesnis už minimumą.");
      const vars = step.variables.map((k) => varOf(ds, k));
      const keys = new Set(step.variables);
      const rows = ds.rows.map((r) => {
        const out = { ...r };
        for (const k of keys) {
          const x = num(r[k]);
          out[k] = x === null ? null : step.min + step.max - x;
        }
        return out;
      });
      const variables = ds.variables.map((v) => {
        if (!keys.has(v.key)) return v;
        // Value labels follow the reversed codes.
        const valueLabels = v.valueLabels
          ? Object.fromEntries(
              Object.entries(v.valueLabels).map(([raw, l]) => {
                const x = Number(raw);
                return [Number.isNaN(x) ? raw : String(step.min + step.max - x), l];
              })
            )
          : undefined;
        return { ...v, label: `${v.label} (atv.)`, ...(valueLabels ? { valueLabels } : {}) };
      });
      const names = vars.map(shortName);
      const sentence =
        `${ltPlural(names.length, ["Teiginys", "Teiginiai", "Teiginių"])} ${listLt(names)} ` +
        `${names.length === 1 ? "perkoduotas" : "perkoduoti"} atvirkščiai (${fmt(step.min)}–${fmt(step.max)}).`;
      return { dataset: { ...ds, variables, rows }, sentence };
    }

    case "recode": {
      const src = varOf(ds, step.variable);
      if (!step.target.trim()) throw new Error("Įveskite naujo kintamojo pavadinimą.");
      if (ds.variables.some((v) => v.key === step.target))
        throw new Error(`Kintamasis „${step.target}“ jau yra – pasirinkite kitą pavadinimą.`);
      if (step.rules.length === 0) throw new Error("Pridėkite bent vieną grupę.");
      const groups = [...new Set(step.rules.map((r) => r.group.trim()).filter(Boolean))];
      const code = new Map(groups.map((g, i) => [g, String(i + 1)]));
      const rows = ds.rows.map((r) => {
        const raw = r[step.variable];
        const x = num(raw);
        let out: string | null = null;
        if (raw !== null && raw !== undefined && raw !== "") {
          for (const rule of step.rules) {
            const hit =
              rule.value !== undefined && rule.value !== ""
                ? String(raw) === rule.value
                : x !== null &&
                  (rule.from === undefined || x >= rule.from) &&
                  (rule.to === undefined || x <= rule.to);
            if (hit) {
              out = code.get(rule.group.trim()) ?? null;
              break;
            }
          }
        }
        return { ...r, [step.target]: out };
      });
      const variable: Variable = {
        key: step.target,
        label: step.label.trim() || step.target,
        type: "categorical",
        valueLabels: Object.fromEntries(groups.map((g) => [code.get(g)!, g])),
      };
      const sentence =
        `Kintamasis „${shortName(src)}“ sugrupuotas į naują kintamąjį „${variable.label}“ ` +
        `(${groups.join("; ")}).`;
      return { dataset: { ...ds, variables: [...ds.variables, variable], rows }, sentence };
    }

    case "compute": {
      if (step.items.length < 2) throw new Error("Skalei pasirinkite bent du teiginius.");
      if (!step.target.trim()) throw new Error("Įveskite skalės kintamojo pavadinimą.");
      if (ds.variables.some((v) => v.key === step.target))
        throw new Error(`Kintamasis „${step.target}“ jau yra – pasirinkite kitą pavadinimą.`);
      const items = step.items.map((k) => varOf(ds, k));
      const minValid = Math.min(Math.max(1, Math.round(step.minValid)), step.items.length);
      let nMissing = 0;
      const rows = ds.rows.map((r) => {
        const vals = step.items.map((k) => num(r[k])).filter((x): x is number => x !== null);
        let score: number | null = null;
        if (vals.length >= minValid) {
          const s = vals.reduce((a, b) => a + b, 0);
          // A sum over partially answered items is prorated so scores stay comparable.
          score = step.fn === "mean" ? s / vals.length : (s / vals.length) * step.items.length;
        } else nMissing++;
        return { ...r, [step.target]: score };
      });
      const variable: Variable = { key: step.target, label: step.label.trim() || step.target, type: "numeric" };
      const what = step.fn === "mean" ? "vidurkis" : "suma";
      const range = items.length > 2 ? `${items[0].key}–${items[items.length - 1].key}` : listLt(items.map((v) => v.key));
      const partial =
        minValid < step.items.length
          ? ` Balas skaičiuotas, kai atsakyta bent į ${minValid} iš ${step.items.length} teiginių` +
            (step.fn === "sum" ? " (trūkstami atsakymai pakeisti respondento vidurkiu)" : "") +
            "."
          : "";
      const sentence =
        `Skalės „${variable.label}“ balas apskaičiuotas kaip teiginių ${range} ${what}.${partial}` +
        (nMissing > 0 ? ` ${nMissing} ${ltPlural(nMissing, ["respondentui", "respondentams", "respondentų"])} balas neapskaičiuotas dėl trūkstamų atsakymų.` : "");
      return { dataset: { ...ds, variables: [...ds.variables, variable], rows }, sentence };
    }

    case "filter": {
      const v = varOf(ds, step.variable);
      if (step.value === "") throw new Error("Įveskite reikšmę.");
      const target = num(step.value);
      const keep = (r: Dataset["rows"][number]) => {
        const raw = r[step.variable];
        if (raw === null || raw === undefined || raw === "") return false;
        if (step.op === "==" || step.op === "!=") {
          const eq = target !== null && num(raw) !== null ? num(raw) === target : String(raw) === step.value;
          return step.op === "==" ? eq : !eq;
        }
        const x = num(raw);
        if (x === null || target === null) return false;
        switch (step.op) {
          case ">": return x > target;
          case ">=": return x >= target;
          case "<": return x < target;
          default: return x <= target;
        }
      };
      const rows = ds.rows.filter(keep);
      if (rows.length === 0) throw new Error("Atrankos sąlygą atitinka 0 atvejų.");
      const shown = v.valueLabels?.[step.value] ?? step.value;
      const sentence =
        `Analizei atrinkti atvejai, kurių „${shortName(v)}“ reikšmė ${OP_TEXT[step.op]} ${shown} ` +
        `(n = ${rows.length} iš ${ds.rows.length}).`;
      return { dataset: { ...ds, rows }, sentence };
    }
  }
}

/** Runs all steps in order. A failing step is skipped (and reported); later steps still run. */
export function applyPrep(raw: Dataset, steps: PrepStep[]): PrepResult {
  let ds = raw;
  const sentences: string[] = [];
  const errors: (string | null)[] = [];
  for (const step of steps) {
    try {
      const out = applyStep(ds, step);
      ds = out.dataset;
      sentences.push(out.sentence);
      errors.push(null);
    } catch (e) {
      sentences.push("");
      errors.push((e as Error).message);
    }
  }
  return { dataset: ds, sentences, errors };
}

let stepCounter = 0;
export const newStepId = () => `step-${Date.now().toString(36)}-${++stepCounter}`;
