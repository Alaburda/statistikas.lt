import { useState } from "react";
import type { Dataset, Variable } from "../types";
import { applyPrep, newStepId, STEP_KIND_LABEL, type FilterOp, type PrepStep } from "../data/prep";
import { track } from "../analytics";

/** Distinct non-missing raw values of a column (capped), numerically sorted when possible. */
function distinct(ds: Dataset, key: string, cap = 40): string[] {
  const set = new Set<string>();
  for (const r of ds.rows) {
    const v = r[key];
    if (v === null || v === undefined || v === "") continue;
    set.add(String(v));
    if (set.size > cap) break;
  }
  return [...set].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    return !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : a.localeCompare(b, "lt");
  });
}

/** Observed numeric range across columns (for the reverse-coding defaults). */
function numericRange(ds: Dataset, keys: string[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of ds.rows)
    for (const k of keys) {
      const x = Number(r[k]);
      if (r[k] === null || r[k] === "" || Number.isNaN(x)) continue;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
  return lo <= hi ? [lo, hi] : null;
}

/** "Pasitenkinimas studijomis" → "pasitenkinimas_studijomis" (ASCII, for variable keys). */
function slug(label: string): string {
  return (
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "skale"
  );
}

/** A key not yet used in the dataset: base, base_2, base_3, … */
function freeKey(ds: Dataset, base: string): string {
  const used = new Set(ds.variables.map((v) => v.key));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function defaultStep(kind: PrepStep["kind"], ds: Dataset): PrepStep {
  const id = newStepId();
  switch (kind) {
    case "reverse":
      return { kind, id, variables: [], min: 1, max: 5 };
    case "recode":
      return { kind, id, variable: "", target: "", label: "", rules: [{ group: "" }, { group: "" }] };
    case "compute":
      return { kind, id, target: freeKey(ds, "skale"), label: "", items: [], fn: "mean", minValid: 1 };
    case "filter":
      return { kind, id, variable: "", op: "==", value: "" };
  }
}

function VarChecklist({
  vars,
  selected,
  onChange,
}: {
  vars: Variable[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const set = new Set(selected);
  return (
    <div className="multi-pick">
      {vars.map((v) => (
        <label key={v.key} className="multi-pick-item">
          <input
            type="checkbox"
            checked={set.has(v.key)}
            onChange={(e) =>
              // Keep dataset order, so "K1–K8" ranges read naturally in the methods text.
              onChange(vars.map((x) => x.key).filter((k) => (k === v.key ? e.target.checked : set.has(k))))
            }
          />
          {v.label}
        </label>
      ))}
    </div>
  );
}

function VarSelect({ vars, value, onChange }: { vars: Variable[]; value: string; onChange: (k: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— pasirinkite —</option>
      {vars.map((v) => (
        <option key={v.key} value={v.key}>
          {v.label}
        </option>
      ))}
    </select>
  );
}

const numOrUndef = (s: string) => (s.trim() === "" || Number.isNaN(Number(s.replace(",", "."))) ? undefined : Number(s.replace(",", ".")));

function StepForm({
  step,
  ds,
  onSave,
  onCancel,
}: {
  step: PrepStep;
  /** The dataset as it is before this step. */
  ds: Dataset;
  onSave: (s: PrepStep) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PrepStep>(step);
  const set = (patch: Partial<PrepStep>) => setDraft((d) => ({ ...d, ...patch }) as PrepStep);
  const preview = applyPrep(ds, [draft]);
  const error = preview.errors[0];
  const numericish = ds.variables.filter((v) => numericRange(ds, [v.key]) !== null);

  let body: JSX.Element;
  switch (draft.kind) {
    case "reverse":
      body = (
        <>
          <label className="pick">
            <span>Teiginiai, kuriuos perkoduoti atvirkščiai</span>
            <VarChecklist
              vars={numericish}
              selected={draft.variables}
              onChange={(variables) => {
                const range = numericRange(ds, variables);
                set(range ? { variables, min: range[0], max: range[1] } : { variables });
              }}
            />
          </label>
          <div className="prep-row">
            <label className="pick">
              <span>Skalės minimumas</span>
              <input type="number" value={draft.min} onChange={(e) => set({ min: Number(e.target.value) })} />
            </label>
            <label className="pick">
              <span>Skalės maksimumas</span>
              <input type="number" value={draft.max} onChange={(e) => set({ max: Number(e.target.value) })} />
            </label>
          </div>
          <p className="prep-help">
            Reikšmė x pakeičiama į (min + max − x), pvz., 1–5 skalėje 1 ↔ 5, 2 ↔ 4.
          </p>
        </>
      );
      break;
    case "compute":
      body = (
        <>
          <div className="prep-row">
            <label className="pick">
              <span>Skalės pavadinimas</span>
              <input
                value={draft.label}
                placeholder="pvz., Stresas"
                onChange={(e) => set({ label: e.target.value, target: freeKey(ds, slug(e.target.value)) })}
              />
            </label>
            <label className="pick">
              <span>Skaičiavimas</span>
              <select value={draft.fn} onChange={(e) => set({ fn: e.target.value as "mean" | "sum" })}>
                <option value="mean">Vidurkis</option>
                <option value="sum">Suma</option>
              </select>
            </label>
            <label className="pick">
              <span>Mažiausiai atsakytų teiginių</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, draft.items.length)}
                value={draft.minValid}
                onChange={(e) => set({ minValid: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="pick">
            <span>Skalės teiginiai</span>
            <VarChecklist
              vars={numericish}
              selected={draft.items}
              onChange={(items) =>
                set({ items, minValid: draft.minValid >= draft.items.length ? items.length : draft.minValid })
              }
            />
          </label>
          <p className="prep-help">
            Atvirkščiai suformuluotus teiginius pirmiausia perkoduokite atskiru žingsniu – žingsniai vykdomi iš eilės.
          </p>
        </>
      );
      break;
    case "recode": {
      const src = ds.variables.find((v) => v.key === draft.variable);
      const values = src && src.type === "categorical" ? distinct(ds, src.key) : [];
      const byValue = src?.type === "categorical";
      body = (
        <>
          <div className="prep-row">
            <label className="pick">
              <span>Pradinis kintamasis</span>
              <VarSelect
                vars={ds.variables}
                value={draft.variable}
                onChange={(variable) => {
                  const v = ds.variables.find((x) => x.key === variable);
                  set({
                    variable,
                    target: variable ? freeKey(ds, `${variable}_gr`) : "",
                    label: v ? `${v.label} (grupės)` : "",
                    rules:
                      v?.type === "categorical"
                        ? distinct(ds, variable).map((value) => ({ value, group: v.valueLabels?.[value] ?? value }))
                        : [{ group: "" }, { group: "" }],
                  });
                }}
              />
            </label>
            <label className="pick">
              <span>Naujo kintamojo pavadinimas</span>
              <input value={draft.label} onChange={(e) => set({ label: e.target.value })} />
            </label>
          </div>
          {src && (
            <div className="prep-rules">
              {draft.rules.map((rule, i) => {
                const upd = (patch: Partial<typeof rule>) =>
                  set({ rules: draft.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
                return (
                  <div className="prep-rule" key={i}>
                    {byValue ? (
                      <code className="value-raw">{src.valueLabels?.[rule.value ?? ""] ?? rule.value}</code>
                    ) : (
                      <>
                        <input
                          aria-label="nuo"
                          placeholder="nuo"
                          defaultValue={rule.from ?? ""}
                          onChange={(e) => upd({ from: numOrUndef(e.target.value) })}
                        />
                        <span>–</span>
                        <input
                          aria-label="iki"
                          placeholder="iki"
                          defaultValue={rule.to ?? ""}
                          onChange={(e) => upd({ to: numOrUndef(e.target.value) })}
                        />
                      </>
                    )}
                    <span className="value-arrow">→</span>
                    <input
                      className="prep-group"
                      placeholder="grupė"
                      value={rule.group}
                      onChange={(e) => upd({ group: e.target.value })}
                    />
                    {!byValue && draft.rules.length > 1 && (
                      <button
                        className="link-btn"
                        onClick={() => set({ rules: draft.rules.filter((_, j) => j !== i) })}
                        aria-label="Pašalinti grupę"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
              {!byValue && (
                <button className="link-btn" onClick={() => set({ rules: [...draft.rules, { group: "" }] })}>
                  + grupė
                </button>
              )}
              <p className="prep-help">
                {byValue
                  ? "Kategorijoms su tuo pačiu grupės pavadinimu bus priskirta ta pati grupė (sujungtos)."
                  : "Ribos įskaitomos; tuščia riba reiškia „be ribos“. Reikšmės, nepatekusios į jokią grupę, tampa trūkstamomis."}
              </p>
              {values.length > 40 && <p className="prep-help">Rodomos tik pirmosios 40 reikšmių.</p>}
            </div>
          )}
        </>
      );
      break;
    }
    case "filter": {
      const v = ds.variables.find((x) => x.key === draft.variable);
      body = (
        <div className="prep-row">
          <label className="pick">
            <span>Kintamasis</span>
            <VarSelect vars={ds.variables} value={draft.variable} onChange={(variable) => set({ variable, value: "" })} />
          </label>
          <label className="pick">
            <span>Sąlyga</span>
            <select value={draft.op} onChange={(e) => set({ op: e.target.value as FilterOp })}>
              <option value="==">=</option>
              <option value="!=">≠</option>
              <option value=">">&gt;</option>
              <option value=">=">≥</option>
              <option value="<">&lt;</option>
              <option value="<=">≤</option>
            </select>
          </label>
          <label className="pick">
            <span>Reikšmė</span>
            {v?.type === "categorical" ? (
              <select value={draft.value} onChange={(e) => set({ value: e.target.value })}>
                <option value="">— pasirinkite —</option>
                {distinct(ds, v.key).map((raw) => (
                  <option key={raw} value={raw}>
                    {v.valueLabels?.[raw] ?? raw}
                  </option>
                ))}
              </select>
            ) : (
              <input value={draft.value} onChange={(e) => set({ value: e.target.value.replace(",", ".") })} />
            )}
          </label>
        </div>
      );
      break;
    }
  }

  return (
    <div className="prep-form">
      {body}
      <div className="prep-preview">
        {error ? <span className="prep-error">⚠ {error}</span> : <span>Ataskaitoje: {preview.sentences[0]}</span>}
      </div>
      <div className="prep-actions">
        <button className="primary-btn" disabled={!!error} onClick={() => onSave(draft)}>
          Išsaugoti
        </button>
        <button className="ghost-btn" onClick={onCancel}>
          Atšaukti
        </button>
      </div>
    </div>
  );
}

export function PrepPanel({
  raw,
  steps,
  onChange,
}: {
  raw: Dataset;
  steps: PrepStep[];
  onChange: (next: PrepStep[]) => void;
}) {
  const [open, setOpen] = useState(steps.length > 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftNew, setDraftNew] = useState<PrepStep | null>(null);
  const result = applyPrep(raw, steps);
  const before = (i: number) => applyPrep(raw, steps.slice(0, i)).dataset;

  const addKind = (kind: PrepStep["kind"]) => {
    setEditing(null);
    setDraftNew(defaultStep(kind, result.dataset));
  };

  return (
    <section className="prep-panel" aria-labelledby="prep-title">
      <button className="prep-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span id="prep-title" className="prep-title">
          {open ? "▾" : "▸"} Duomenų paruošimas
        </span>
        <span className="prep-sub">
          {steps.length === 0
            ? "atvirkštinis perkodavimas, skalių balai, grupavimas, atvejų atranka"
            : `${steps.length} ${steps.length === 1 ? "žingsnis" : steps.length < 10 ? "žingsniai" : "žingsnių"} · n = ${result.dataset.rows.length}`}
        </span>
      </button>
      {open && (
        <div className="prep-body">
          {steps.length > 0 && (
            <ol className="prep-steps">
              {steps.map((s, i) => (
                <li key={s.id} className={result.errors[i] ? "has-error" : ""}>
                  <div className="prep-step-head">
                    <span className="prep-kind">{STEP_KIND_LABEL[s.kind]}</span>
                    <span className="prep-step-actions">
                      <button className="link-btn" onClick={() => { setDraftNew(null); setEditing(editing === s.id ? null : s.id); }}>
                        keisti
                      </button>
                      <button
                        className="link-btn"
                        disabled={i === 0}
                        onClick={() => onChange(steps.map((x, j) => (j === i - 1 ? s : j === i ? steps[i - 1] : x)))}
                        aria-label="Perkelti aukščiau"
                      >
                        ↑
                      </button>
                      <button className="link-btn" onClick={() => onChange(steps.filter((x) => x.id !== s.id))}>
                        šalinti
                      </button>
                    </span>
                  </div>
                  <p className="prep-sentence">
                    {result.errors[i] ? <span className="prep-error">⚠ Praleista: {result.errors[i]}</span> : result.sentences[i]}
                  </p>
                  {editing === s.id && (
                    <StepForm
                      step={s}
                      ds={before(i)}
                      onCancel={() => setEditing(null)}
                      onSave={(next) => {
                        onChange(steps.map((x) => (x.id === s.id ? next : x)));
                        setEditing(null);
                      }}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
          {draftNew ? (
            <div className="prep-new">
              <div className="prep-kind">{STEP_KIND_LABEL[draftNew.kind]}</div>
              <StepForm
                step={draftNew}
                ds={result.dataset}
                onCancel={() => setDraftNew(null)}
                onSave={(s) => {
                  track("analize_prep_step", { step_type: s.kind });
                  onChange([...steps, s]);
                  setDraftNew(null);
                }}
              />
            </div>
          ) : (
            <div className="prep-add">
              <span>+ Pridėti žingsnį:</span>
              {(Object.keys(STEP_KIND_LABEL) as PrepStep["kind"][]).map((k) => (
                <button key={k} className="ghost-btn" onClick={() => addKind(k)}>
                  {STEP_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          <p className="prep-help">
            Žingsniai taikomi iš eilės; pradiniai duomenys nekeičiami. Visi analizės blokai mato jau paruoštus
            duomenis, o žingsnių aprašai įtraukiami į Word ataskaitos „Duomenų analizės“ skyrių.
          </p>
        </div>
      )}
    </section>
  );
}
