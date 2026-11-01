import { useEffect, useState } from "react";
import { track } from "./analytics";
import { BeTab } from "./components/BeTab";
import { CompareTab } from "./components/CompareTab";
import { ContactLink, CtaPanel, SiteFooter } from "./components/Funnel";
import { SurveyTab } from "./components/SurveyTab";
import { Verified } from "./components/Verified";
import { SITE_URL } from "./site";
import { readHash, type Tab } from "./url";

const TABS: { id: Tab; title: string; sub: string }[] = [
  { id: "apklausa", title: "Apklausa", sub: "Kiek žmonių apklausti, kad rezultatas atspindėtų visą grupę?" },
  { id: "grupes", title: "Palyginimas", sub: "Kiek tiriamųjų reikia eksperimentui, atvejo–kontrolės tyrimui ar A/B testui?" },
  { id: "be", title: "Bioekvivalentiškumas", sub: "Kiek tiriamųjų reikia BE tyrimui: tikslus TOST ir EMA ABEL." },
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
          <p className="product">Imties skaičiuoklė</p>
        </div>
        <div className="top-actions">
          <ContactLink source="topbar" tema="konsultacija" className="ask-btn">
            Paklauskite statistiko
          </ContactLink>
        </div>
      </header>

      <main>
        <h1 className="title">Kiek tiriamųjų jums iš tikrųjų reikia?</h1>
        <nav className="choose" role="tablist" aria-label="Tyrimo tipas">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => open(t.id)}>
              <b>{t.title}</b>
              <span>{t.sub}</span>
            </button>
          ))}
        </nav>

        <div hidden={tab !== "apklausa"}>{visited.has("apklausa") && <SurveyTab active={tab === "apklausa"} />}</div>
        <div hidden={tab !== "grupes"}>{visited.has("grupes") && <CompareTab active={tab === "grupes"} />}</div>
        <div hidden={tab !== "be"}>{visited.has("be") && <BeTab active={tab === "be"} />}</div>

        <Verified />
        <CtaPanel tab={tab} />
      </main>
      <SiteFooter />
    </div>
  );
}
