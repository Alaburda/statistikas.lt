import { useEffect, useState } from "react";
import { track } from "./analytics";
import { BeTab } from "./components/BeTab";
import { CompareTab } from "./components/CompareTab";
import { ContactLink, CtaPanel, SiteFooter } from "./components/Funnel";
import { SurveyTab } from "./components/SurveyTab";
import { TabArt } from "./components/TabArt";
import { EN, L, otherLanguageUrl } from "./i18n";
import { SITE_URL } from "./site";
import { readHash, type Tab } from "./url";

const TABS: { id: Tab; title: string; sub: string }[] = [
  {
    id: "apklausa",
    title: L("Imtis apklausoms", "Surveys"),
    sub: L("Kiek žmonių apklausti, kad rezultatas atspindėtų visą grupę?", "How many people to survey so that the result speaks for the whole group?"),
  },
  {
    id: "grupes",
    title: L("Imtis palyginimams", "Comparing groups"),
    sub: L(
      "Kiek tiriamųjų reikia eksperimentui, ANOVA, regresijai ar A/B testui?",
      "How many participants for an experiment, an ANOVA, a regression or an A/B test?",
    ),
  },
  {
    id: "be",
    title: L("Imtis bioekvivalentiškumo tyrimams", "Bioequivalence studies"),
    sub: L("Kiek tiriamųjų reikia BE tyrimui: tikslus TOST ir EMA ABEL.", "How many subjects for a BE study: exact TOST and EMA ABEL."),
  },
];

export function App() {
  const [tab, setTab] = useState<Tab>(() => readHash().tab);
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set([readHash().tab]));

  function open(next: Tab) {
    setTab(next);
    setVisited((v) => new Set(v).add(next));
    track("imtis_tab", { tab: next });
  }

  useEffect(() => {
    const onHash = () => {
      const next = readHash().tab;
      setTab(next);
      setVisited((v) => new Set(v).add(next));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <a className="brand-link" href={SITE_URL}>
            <img className="logo" src={`${import.meta.env.BASE_URL}mark.svg`} alt="" width="36" height="36" />
            <span className="wordmark">Statistikas.lt</span>
          </a>
          <p className="product">{L("Imties skaičiuoklė", "Sample size calculator")}</p>
        </div>
        <div className="top-actions">
          <a
            className="lang-switch"
            href={otherLanguageUrl()}
            hrefLang={EN ? "lt" : "en"}
            lang={EN ? "lt" : "en"}
            onClick={(e) => {
              // Read the hash at click time: it changes with every input.
              e.currentTarget.href = otherLanguageUrl();
              track("imtis_lang", { to: EN ? "lt" : "en" });
            }}
          >
            <span aria-hidden="true">{EN ? "LT" : "EN"}</span>
            <span className="sr-only">{EN ? "Lietuviškai" : "In English"}</span>
          </a>
          <ContactLink source="topbar" tema="konsultacija" className="ask-btn">
            {L("Paklauskite statistiko", "Ask a statistician")}
          </ContactLink>
        </div>
      </header>

      <main>
        <h1 className="title">{L("Kiek tiriamųjų jums iš tikrųjų reikia?", "How many participants do you really need?")}</h1>
        <p className="choose-lead" id="choose-lead">
          {L("Ką planuojate? Pasirinkite vieną iš trijų:", "What are you planning? Pick one of three:")}
        </p>
        <nav className="choose" role="tablist" aria-labelledby="choose-lead">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => open(t.id)}>
              <TabArt tab={t.id} />
              <b>{t.title}</b>
              <span>{t.sub}</span>
              <i>{tab === t.id ? L("✓ Pasirinkta", "✓ Selected") : L("Rinktis →", "Choose →")}</i>
            </button>
          ))}
        </nav>

        <div hidden={tab !== "apklausa"}>{visited.has("apklausa") && <SurveyTab active={tab === "apklausa"} />}</div>
        <div hidden={tab !== "grupes"}>{visited.has("grupes") && <CompareTab active={tab === "grupes"} />}</div>
        <div hidden={tab !== "be"}>{visited.has("be") && <BeTab active={tab === "be"} />}</div>

        <CtaPanel tab={tab} />
      </main>
      <SiteFooter />
    </div>
  );
}
