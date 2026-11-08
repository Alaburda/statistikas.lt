import type { ReactNode } from "react";
import { track } from "../analytics";
import { EN, L } from "../i18n";
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

const CTA_POINTS: Record<string, string[]> = L(
  {
    apklausa: [
      "atrankos planas: iš kur ir kaip atrinkti respondentus",
      "imties skaičiavimas su pagrindimu darbui ar užsakovui",
      "kvotos, svoriai ir atsako dažnio didinimas",
    ],
    grupes: [
      "efekto dydžio pagrindimas iš literatūros ar pilotinio tyrimo",
      "mišrūs modeliai, klasterizuoti ir daugiacentriai tyrimai, išgyvenamumas",
      "imties skyrius protokolui, paraiškai ar etikos komitetui",
    ],
    be: [
      "imties pagrindimas protokolui ir statistinės analizės planas",
      "replikatų dizainai, ABEL ir RSABE, dviejų etapų planai",
      "bioekvivalentiškumo ataskaitos statistinė dalis",
    ],
  },
  {
    apklausa: [
      "a sampling plan: where and how to select respondents",
      "a sample size calculation with a justification for your thesis or client",
      "quotas, weights and raising the response rate",
    ],
    grupes: [
      "justifying the effect size from the literature or a pilot",
      "mixed models, cluster randomised and multicentre trials, survival",
      "the sample size section of a protocol, grant or ethics application",
    ],
    be: [
      "sample size justification for the protocol and the statistical analysis plan",
      "replicate designs, ABEL and RSABE, two-stage designs",
      "the statistical part of the bioequivalence report",
    ],
  },
);

/** Mondrian-style call to action: the free number → a calculation that survives review. */
export function CtaPanel({ tab }: { tab: string }) {
  return (
    <section className="cta-panel" aria-labelledby="cta-title">
      <div className="cta-body">
        <span className="eyebrow">{L("Kai skaičiaus nepakanka", "When a number is not enough")}</span>
        <h2 id="cta-title">{L("Skaičiavimą turės apginti prieš recenzentą ar komitetą?", "Will the calculation have to stand up to a reviewer or a committee?")}</h2>
        <ul>
          {CTA_POINTS[tab].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="cta-price">
          {L(
            "Projektas už fiksuotą kainą arba konsultacija nuo 50 €/val. · pirmas pokalbis nemokamas",
            "A fixed-price project or a consultation from €50/hour · the first call is free",
          )}
        </p>
        <div className="cta-actions">
          <ContactLink source={`cta-${tab}`} className="cta-btn">
            {L("Aptarkime jūsų tyrimą →", "Let's discuss your study →")}
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
      <p>
        {L(
          "Skaičiuojama tik jūsų naršyklėje: įvesti skaičiai niekur nesiunčiami ir nesaugomi.",
          "Everything is calculated in your browser: the numbers you enter are never sent or stored.",
        )}
      </p>
      {EN ? (
        <nav className="foot-links" aria-label="Site links">
          <OutLink href={SITE_URL}>Statistikas.lt (in Lithuanian)</OutLink>
          <ContactLink source="footer">Contact</ContactLink>
        </nav>
      ) : (
        <nav className="foot-links" aria-label="Svetainės nuorodos">
          <OutLink href={SITE_URL}>Statistikas.lt</OutLink>
          <OutLink href={SERVICES_URL}>Paslaugos</OutLink>
          <OutLink href={GUIDE_URL}>Imties dydžio gidas</OutLink>
          <OutLink href={ANALIZE_URL}>Statistinė analizė</OutLink>
          <ContactLink source="footer">Susisiekti</ContactLink>
        </nav>
      )}
    </footer>
  );
}
