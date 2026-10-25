import { useState } from "react";
import type { Check } from "../engine/audit";

const ICON: Record<Check["status"], string> = { ok: "✓", warn: "!", fail: "✕" };
const STATUS_LABEL: Record<Check["status"], string> = { ok: "Tvarkinga", warn: "Dėmesio", fail: "Problema" };

/** Data-quality report: one row per check, problems first, examples on demand. */
export function AuditPanel({ checks, summary }: { checks: Check[]; summary: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const order = { fail: 0, warn: 1, ok: 2 };
  const sorted = checks.slice().sort((a, b) => order[a.status] - order[b.status]);
  const problems = checks.filter((c) => c.status !== "ok").length;
  return (
    <div className="audit">
      <p className="audit-summary">
        {summary}{" "}
        {problems === 0
          ? "Problemų nerasta."
          : `${problems} ${problems === 1 ? "patikra reikalauja" : "patikros reikalauja"} dėmesio – prognozė vis tiek apskaičiuota.`}
      </p>
      <ul className="audit-list">
        {sorted.map((c) => (
          <li key={c.id} className={`audit-item audit-${c.status}`}>
            <span className="audit-icon" aria-label={STATUS_LABEL[c.status]} title={STATUS_LABEL[c.status]}>
              {ICON[c.status]}
            </span>
            <div className="audit-body">
              <div className="audit-title">
                <strong>{c.title}</strong>
                <span className="audit-status">{STATUS_LABEL[c.status]}</span>
              </div>
              <p>{c.detail}</p>
              {c.examples.length > 0 && (
                <>
                  <button
                    className="link-btn"
                    onClick={() => setOpen(open === c.id ? null : c.id)}
                    aria-expanded={open === c.id}
                  >
                    {open === c.id ? "Slėpti pavyzdžius ▾" : "Rodyti pavyzdžius ▸"}
                  </button>
                  {open === c.id && (
                    <ul className="audit-examples">
                      {c.examples.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
