import type { ReactNode } from "react";
import { ANALIZE_URL, CONTACT_EMAIL, SERVICES_URL, SITE_URL, contactUrl } from "../site";
import { track } from "../analytics";

/** Outbound link: always a new tab (so the plan isn't lost), optionally tracked. */
export function OutLink({
  href,
  location,
  className,
  children,
}: {
  href: string;
  /** planavimas_cta_click location; omit for untracked links. */
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
      onClick={location ? () => track("planavimas_cta_click", { location }) : undefined}
    >
      {children}
    </a>
  );
}

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

/** Mondrian-style call to action: the free tool → a planning system built for the company. */
export function CtaPanel() {
  return (
    <section className="cta-panel" aria-labelledby="cta-title">
      <div className="cta-body">
        <span className="eyebrow">Paklausos planavimas įmonėms</span>
        <h2 id="cta-title">Norite, kad tai veiktų su jūsų ERP kiekvieną mėnesį?</h2>
        <ul>
          <li>automatinis duomenų paėmimas iš ERP, el. parduotuvės ar sandėlio sistemos</li>
          <li>prognozės pagal prekę, sandėlį ir klientą – su akcijomis ir kainomis</li>
          <li>mėnesinis S&amp;OP paketas: planas, atsargų rekomendacijos, nuokrypių analizė</li>
          <li>modelių priežiūra ir tikslumo stebėsena</li>
        </ul>
        <p className="cta-price">Projektas arba nuolatinė partnerystė · pirmas pokalbis nemokamas</p>
        <div className="cta-actions">
          <ContactLink source="cta" className="cta-btn">
            Aptarkime jūsų planavimą →
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

export function ExportToast({ onClose }: { onClose: () => void }) {
  return (
    <div className="export-toast" role="status">
      <div>
        <strong>Planas atsisiųstas.</strong> Norite, kad prognozė atsinaujintų automatiškai iš jūsų sistemų?{" "}
        <ContactLink source="eksportas" className="toast-link">
          Pasikalbėkime →
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
        Duomenys apdorojami tik jūsų naršyklėje ir niekur nesiunčiami. Demonstraciniai duomenys sintetiniai
        (išgalvoto didmenininko savaitiniai pardavimai).
      </p>
      <nav className="foot-links" aria-label="Svetainės nuorodos">
        <OutLink href={SITE_URL}>Statistikas.lt</OutLink>
        <OutLink href={SERVICES_URL}>Paslaugos</OutLink>
        <OutLink href={ANALIZE_URL}>Statistinė analizė</OutLink>
        <ContactLink source="footer">Susisiekti</ContactLink>
      </nav>
    </footer>
  );
}
