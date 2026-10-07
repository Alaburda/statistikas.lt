import { useState } from "react";
import type { ReactNode } from "react";
import { ARTICLES_URL, CONTACT_EMAIL, SERVICES_URL, SITE_URL, contactUrl } from "../site";
import { track } from "../analytics";

/** Outbound link: always a new tab (so the analysis isn't lost), optionally tracked. */
export function OutLink({
  href,
  location,
  className,
  children,
}: {
  href: string;
  /** analize_cta_click location; omit for untracked links. */
  location?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={className}
      onClick={location ? () => track("analize_cta_click", { location }) : undefined}
    >
      {children}
    </a>
  );
}

/** Link to the contact form, tagged with where in the app the visitor came from. */
export function ContactLink({
  source,
  className,
  children,
}: {
  source: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <OutLink href={contactUrl(source)} location={source} className={className}>
      {children}
    </OutLink>
  );
}

const INTRO_KEY = "analize-intro-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

/** Compact, collapsible intro with the value proposition and three steps. */
export function IntroPanel() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(INTRO_KEY, next ? "1" : "0");
    } catch {
      /* storage unavailable — the panel still works for this visit */
    }
  };
  return (
    <section className="intro" aria-label="Apie įrankį">
      <div className="intro-head">
        <span className="eyebrow">Nemokama statistinė analizė</span>
        <button className="link-btn" onClick={toggle} aria-expanded={!collapsed}>
          {collapsed ? "Rodyti instrukciją ▸" : "Sutraukti ▾"}
        </button>
      </div>
      {!collapsed && (
        <>
          <p className="intro-lead">
            Gaukite lenteles, diagramas ir rezultatų aprašymą be programų diegimo – viskas vyksta
            jūsų naršyklėje.
          </p>
          <ol className="intro-steps">
            <li>
              <span className="step-num">1</span>
              <span>Įkelkite CSV ar Excel failą</span>
            </li>
            <li>
              <span className="step-num">2</span>
              <span>Pasirinkite testą ir kintamuosius</span>
            </li>
            <li>
              <span className="step-num">3</span>
              <span>Atsisiųskite ataskaitą į Word</span>
            </li>
          </ol>
          <p className="intro-privacy">
            Duomenys apdorojami tik jūsų naršyklėje ir niekur nesiunčiami.
          </p>
        </>
      )}
    </section>
  );
}

/** Mondrian-style call to action shown after the analysis blocks. */
export function CtaPanel() {
  return (
    <section className="cta-panel" aria-labelledby="cta-title">
      <div className="cta-body">
        <span className="eyebrow">Statistikos konsultacijos</span>
        <h2 id="cta-title">Reikia daugiau nei kelių testų?</h2>
        <ul>
          <li>rezultatų interpretacija ir aprašymas darbui ar publikacijai</li>
          <li>tinkamo metodo parinkimas</li>
          <li>imties dydžio skaičiavimas</li>
          <li>atsakymai recenzentams</li>
        </ul>
        <p className="cta-price">
          Konsultacija nuo 50 € / val. · pirmas 30 min. pokalbis nemokamas
        </p>
        <div className="cta-actions">
          <ContactLink source="cta" className="cta-btn">
            Aptarkime jūsų analizę →
          </ContactLink>
          <a className="cta-mail" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
      <div className="cta-art" aria-hidden="true">
        <span className="art-blue" />
        <span className="art-yellow" />
        <span className="art-red" />
      </div>
    </section>
  );
}

/** Dismissible (non-blocking) banner shown once a Word report has been downloaded. */
export function ExportToast({ onClose }: { onClose: () => void }) {
  return (
    <div className="export-toast" role="status">
      <div>
        <strong>Ataskaita atsisiųsta.</strong> Norite, kad statistikas peržiūrėtų rezultatus prieš
        pateikiant?{" "}
        <ContactLink source="eksportas" className="toast-link">
          Paklauskite statistiko →
        </ContactLink>
      </div>
      <button className="toast-close" onClick={onClose} aria-label="Uždaryti pranešimą" title="Uždaryti">
        ✕
      </button>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="foot">
      <p>
        Duomenys apdorojami tik jūsų naršyklėje ir niekur nesiunčiami. Demonstraciniai duomenys:
        MASS::birthwt ir AER::CPS1985 (R).
      </p>
      <nav className="foot-links" aria-label="Svetainės nuorodos">
        <OutLink href={SITE_URL}>Statistikas.lt</OutLink>
        <OutLink href={SERVICES_URL}>Paslaugos</OutLink>
        <OutLink href={ARTICLES_URL}>Straipsniai</OutLink>
        <ContactLink source="footer">Susisiekti</ContactLink>
      </nav>
    </footer>
  );
}
