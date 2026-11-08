import { useState } from "react";
import { track } from "../analytics";
import { L, LANG } from "../i18n";
import type { Report } from "../report";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The Facebook in-app browser can refuse the Clipboard API.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function CopyButton({ text, label, what }: { text: string; label: string; what: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(text);
        setState(ok ? "ok" : "fail");
        if (ok) track("imtis_copy", { what });
        window.setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "ok" ? L("Nukopijuota ✓", "Copied ✓") : state === "fail" ? L("Nepavyko, pažymėkite ranka", "Failed: select it by hand") : label}
    </button>
  );
}

/** Scrolls to the full methods text of the tab on screen (hidden tabs keep their own copy). */
function showFullText() {
  const blocks = Array.from(document.querySelectorAll<HTMLElement>(".report-block"));
  blocks.find((b) => b.offsetParent !== null)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** The formal one-sentence result under the answer, ready to paste into a paper or protocol. */
export function StatementBox({ statement }: { statement: Report["statement"] }) {
  const [lang, setLang] = useState<"lt" | "en">(LANG);
  return (
    <div className="statement">
      <div className="statement-head">
        <span className="statement-label">{L("Straipsniui ar protokolui", "For a paper or protocol")}</span>
        <div className="statement-lang" role="radiogroup" aria-label={L("Teksto kalba", "Text language")}>
          {(["lt", "en"] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <p className="statement-text" lang={lang}>
        {statement[lang]}
      </p>
      <div className="statement-actions">
        <CopyButton text={statement[lang]} label={L("Kopijuoti", "Copy")} what={`statement-${lang}`} />
        <button type="button" className="link" onClick={showFullText}>
          {L("Išsamus metodikos tekstas ir šaltiniai ↓", "Full methods text and references ↓")}
        </button>
      </div>
    </div>
  );
}

/** The paragraph for the methods section, the code that reproduces it, and a link to it. */
export function ReportBlock({ report }: { report: Report }) {
  const [lang, setLang] = useState<"lt" | "en">(LANG);
  const paragraph = report[lang];
  const refs = report.refs.join("\n");
  return (
    <section className="block report-block" aria-labelledby="report-title">
      <h2 id="report-title">{L("Tekstas metodikos skyriui", "Text for the methods section")}</h2>
      <p className="block-lead">
        {L(
          "Į tekstą įrašyti visi įvesties skaičiai, kad skaičiavimą galėtų pakartoti recenzentas. Laužtiniuose skliaustuose paaiškinkite, iš kur paėmėte prielaidas.",
          "Every input is in the text, so a reviewer can repeat the calculation. In the square brackets, say where your assumptions come from.",
        )}
      </p>
      <div className="report-tabs" role="radiogroup" aria-label={L("Teksto kalba", "Text language")}>
        <button type="button" role="radio" aria-checked={lang === "lt"} className={lang === "lt" ? "on" : ""} onClick={() => setLang("lt")}>
          Lietuviškai
        </button>
        <button type="button" role="radio" aria-checked={lang === "en"} className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
          English
        </button>
      </div>
      <p className="report-text">{paragraph}</p>
      <ol className="report-refs">
        {report.refs.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ol>
      <div className="report-actions">
        <CopyButton text={`${paragraph}\n\n${refs}`} label={L("Kopijuoti tekstą", "Copy text")} what={`text-${lang}`} />
        <CopyButton text={window.location.href} label={L("Kopijuoti nuorodą į šį skaičiavimą", "Copy a link to this calculation")} what="link" />
      </div>

      <h3>{L("Patikrinkite patys", "Check it yourself")}</h3>
      {report.gpower && (
        <p className="block-lead">
          <b>G*Power:</b> {report.gpower}
        </p>
      )}
      <pre className="code">
        <code>{report.r}</code>
      </pre>
      <div className="report-actions">
        <CopyButton text={report.r} label={L("Kopijuoti R kodą", "Copy R code")} what="r" />
      </div>
    </section>
  );
}
