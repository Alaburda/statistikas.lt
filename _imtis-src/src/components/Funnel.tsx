import type { ReactNode } from "react";
import { track } from "../analytics";
import { ANALIZE_URL, CONTACT_EMAIL, GUIDE_URL, SERVICES_URL, SITE_URL, contactUrl } from "../site";

/** Outbound link: always a new tab (so the inputs aren't lost), optionally tracked. */
export function OutLink({
  href,
  location,
  className,
  children,
}: {
  href: string;
  /** imtis_cta_click location; omit for untracked links. */
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
      onClick={location ? () => track("imtis_cta_click", { location }) : undefined}
    >
      {children}
    </a>
  );
}

export function ContactLink({
  source,
  tema,
  className,
  children,
}: {
  source: string;
  tema?: "projektas" | "konsultacija";
  className?: string;
  children: ReactNode;
}) {
  return (
    <OutLink href={contactUrl(source, tema)} location={source} className={className}>
      {children}
    </OutLink>
  );
}

const CTA_POINTS: Record<string, string[]> = {
  apklausa: [
    "atrankos planas: iš kur ir kaip atrinkti respondentus",
    "imties skaičiavimas su pagrindimu darbui ar užsakovui",
    "kvotos, svoriai ir atsako dažnio didinimas",
  ],
  grupes: [
    "efekto dydžio pagrindimas iš literatūros ar pilotinio tyrimo",
    "kartotiniai matavimai, klasterizuoti ir daugiacentriai tyrimai",
    "imties skyrius protokolui, paraiškai ar etikos komitetui",
  ],
  be: [
    "imties pagrindimas protokolui ir statistinės analizės planas",
    "replikatų dizainai, ABEL ir RSABE, dviejų etapų planai",
    "bioekvivalentiškumo ataskaitos statistinė dalis",
  ],
};

/** Mondrian-style call to action: the free number → a calculation that survives review. */
export function CtaPanel({ tab }: { tab: string }) {
  return (
    <section className="cta-panel" aria-labelledby="cta-title">
      <div className="cta-body">
        <span className="eyebrow">Kai skaičiaus nepakanka</span>
        <h2 id="cta-title">Skaičiavimą turės apginti prieš recenzentą ar komitetą?</h2>
        <ul>
          {CTA_POINTS[tab].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="cta-price">Projektas už fiksuotą kainą arba konsultacija nuo 50 €/val. · pirmas pokalbis nemokamas</p>
        <div className="cta-actions">
          <ContactLink source={`cta-${tab}`} className="cta-btn">
            Aptarkime jūsų tyrimą →
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

export function SiteFooter() {
  return (
    <footer className="foot">
      <p>Skaičiuojama tik jūsų naršyklėje: įvesti skaičiai niekur nesiunčiami ir nesaugomi.</p>
      <nav className="foot-links" aria-label="Svetainės nuorodos">
        <OutLink href={SITE_URL}>Statistikas.lt</OutLink>
        <OutLink href={SERVICES_URL}>Paslaugos</OutLink>
        <OutLink href={GUIDE_URL}>Imties dydžio gidas</OutLink>
        <OutLink href={ANALIZE_URL}>Statistinė analizė</OutLink>
        <ContactLink source="footer">Susisiekti</ContactLink>
      </nav>
    </footer>
  );
}
