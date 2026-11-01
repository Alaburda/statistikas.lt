import { useState } from "react";
import { track } from "../analytics";
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
      {state === "ok" ? "Nukopijuota ✓" : state === "fail" ? "Nepavyko, pažymėkite ranka" : label}
    </button>
  );
}

/** The paragraph for the methods section, the code that reproduces it, and a link to it. */
export function ReportBlock({ report }: { report: Report }) {
  const [lang, setLang] = useState<"lt" | "en">("lt");
  const paragraph = report[lang];
  const refs = report.refs.join("\n");
  return (
    <section className="block" aria-labelledby="report-title">
      <h2 id="report-title">Tekstas metodikos skyriui</h2>
      <p className="block-lead">
        Į tekstą įrašyti visi įvesties skaičiai, kad skaičiavimą galėtų pakartoti recenzentas. Laužtiniuose skliaustuose
        paaiškinkite, iš kur paėmėte prielaidas.
      </p>
      <div className="report-tabs" role="radiogroup" aria-label="Teksto kalba">
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
        <CopyButton text={`${paragraph}\n\n${refs}`} label="Kopijuoti tekstą" what={`text-${lang}`} />
        <CopyButton text={window.location.href} label="Kopijuoti nuorodą į šį skaičiavimą" what="link" />
      </div>

      <h3>Patikrinkite patys</h3>
      {report.gpower && (
        <p className="block-lead">
          <b>G*Power:</b> {report.gpower}
        </p>
      )}
      <pre className="code">
        <code>{report.r}</code>
      </pre>
      <div className="report-actions">
        <CopyButton text={report.r} label="Kopijuoti R kodą" what="r" />
      </div>
    </section>
  );
}
