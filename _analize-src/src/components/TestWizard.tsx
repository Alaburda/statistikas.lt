import { useState } from "react";
import { getTest } from "../stats/tests";
import { ContactLink, OutLink } from "./Funnel";
import { track } from "../analytics";

// A 2–4 question decision tree ending in a recommended test (or a referral when
// the right test isn't in the tool). Optional: most users already know their test.

export type Leaf = { testId: string; why: string } | { none: string };
export type Node = { q: string; options: { label: string; next: Node | Leaf }[] };

const isLeaf = (n: Node | Leaf): n is Leaf => !("q" in n);

const OUTCOME_GROUPS = (two: string, many: string, twoNp: string, manyNp: string): Node => ({
  q: "Koks lyginamas kintamasis?",
  options: [
    {
      label: "Kiekybinis, apytiksliai normaliai pasiskirstęs (pvz., balas, svoris)",
      next: {
        q: "Kiek grupių lyginate?",
        options: [
          { label: "Dvi", next: { testId: two, why: "Dviejų nepriklausomų grupių vidurkiai lyginami t testu." } },
          { label: "Tris ar daugiau", next: { testId: many, why: "Trijų ir daugiau grupių vidurkiai lyginami ANOVA; porinis palyginimas pateikiamas automatiškai." } },
        ],
      },
    },
    {
      label: "Ranginis (Likerto teiginys) arba aiškiai nenormalus",
      next: {
        q: "Kiek grupių lyginate?",
        options: [
          { label: "Dvi", next: { testId: twoNp, why: "Neparametrinė t testo alternatyva – lygina rangus, normalumo nereikia." } },
          { label: "Tris ar daugiau", next: { testId: manyNp, why: "Neparametrinė ANOVA alternatyva su Dunno poriniu palyginimu." } },
        ],
      },
    },
    {
      label: "Kategorinis (pvz., taip / ne, išsilavinimas)",
      next: { testId: "chisq", why: "Kategorijų pasiskirstymas tarp grupių lyginamas chi kvadrato testu." },
    },
  ],
});

export const WIZARD_TREE: Node = {
  q: "Ką norite sužinoti?",
  options: [
    {
      label: "Ar skiriasi grupės arba matavimai",
      next: {
        q: "Ką lyginate?",
        options: [
          { label: "Skirtingų žmonių grupes (pvz., vyrus ir moteris)", next: OUTCOME_GROUPS("ttest", "anova", "mannwhitney", "kruskal") },
          {
            label: "To paties žmogaus du matavimus (pvz., prieš ir po)",
            next: {
              q: "Koks matavimas?",
              options: [
                { label: "Kiekybinis, skirtumai apytiksliai normalūs", next: { testId: "paired_ttest", why: "Du tų pačių žmonių matavimai lyginami priklausomų imčių t testu." } },
                { label: "Ranginis (Likerto teiginys) arba nenormalus", next: { testId: "wilcoxon", why: "Neparametrinė priklausomų imčių t testo alternatyva." } },
                { label: "Kategorinis (pvz., taip / ne)", next: { none: "Kategorinių matavimų prieš ir po palyginimui reikia McNemaro testo, kurio šiame įrankyje dar nėra." } },
              ],
            },
          },
          { label: "Tris ar daugiau to paties žmogaus matavimų", next: { none: "Pakartotinių matavimų ANOVA ir Friedmano testo šiame įrankyje dar nėra." } },
        ],
      },
    },
    {
      label: "Ar susiję kintamieji",
      next: {
        q: "Kokie kintamieji?",
        options: [
          { label: "Du kiekybiniai, ryšys tiesinis", next: { testId: "correlation", why: "Tiesinio ryšio stiprumą rodo Pirsono r." } },
          { label: "Du ranginiai (Likerto) arba nenormalūs", next: { testId: "spearman", why: "Spirmeno ρ tinka ranginiams duomenims ir nereikalauja normalumo." } },
          { label: "Keli kintamieji ar skalės vienu metu", next: { testId: "cormatrix", why: "Visos koreliacijos vienoje APA lentelėje su M ir SN." } },
          { label: "Du kategoriniai", next: { testId: "chisq", why: "Dviejų kategorinių kintamųjų ryšys tikrinamas chi kvadrato testu." } },
          {
            label: "Noriu prognozuoti vieną kintamąjį pagal kitus",
            next: {
              q: "Koks prognozuojamas (priklausomas) kintamasis?",
              options: [
                { label: "Kiekybinis, vienas prognozuojantis kintamasis", next: { testId: "regression", why: "Paprastoji tiesinė regresija." } },
                { label: "Kiekybinis, keli prognozuojantys kintamieji", next: { testId: "multiple_regression", why: "Daugialypė tiesinė regresija įvertina kiekvieno kintamojo įtaką kontroliuojant kitus." } },
                { label: "Dvireikšmis (taip / ne)", next: { testId: "logistic", why: "Logistinė regresija pateikia šansų santykius." } },
              ],
            },
          },
        ],
      },
    },
    {
      label: "Aprašyti duomenis",
      next: {
        q: "Ką aprašote?",
        options: [
          { label: "Visą imtį (demografiją) vienoje lentelėje", next: { testId: "table1", why: "„1 lentelė“ – standartinė imties charakteristikų lentelė darbo pradžiai." } },
          { label: "Vieną kiekybinį kintamąjį", next: { testId: "descriptives", why: "Vidurkis, SN, mediana ir kvartiliai." } },
          { label: "Vieną kategorinį kintamąjį", next: { testId: "frequencies", why: "Dažniai ir procentai." } },
        ],
      },
    },
    { label: "Patikrinti klausimyno skalės patikimumą", next: { testId: "cronbach", why: "Cronbacho α parodo, ar skalės teiginiai matuoja tą patį." } },
  ],
};

const GUIDE_URL = "https://statistikas.lt/posts/kaip-pasirinkti-statistini-testa/kaip-pasirinkti-statistini-testa.html";

export function TestWizard({ onPick, onClose }: { onPick: (testId: string) => void; onClose: () => void }) {
  const [path, setPath] = useState<number[]>([]);
  let node: Node | Leaf = WIZARD_TREE;
  const answers: string[] = [];
  for (const i of path) {
    const opt: Node["options"][number] = (node as Node).options[i];
    answers.push(opt.label);
    node = opt.next;
  }

  return (
    <div className="wizard" role="dialog" aria-label="Testo pasirinkimo pagalbininkas">
      <div className="wizard-head">
        <strong>Padėsime pasirinkti testą</strong>
        <button className="link-btn" onClick={onClose} aria-label="Uždaryti">
          ✕
        </button>
      </div>
      {answers.length > 0 && (
        <ol className="wizard-trail">
          {answers.map((a, i) => (
            <li key={i}>
              <button className="link-btn" onClick={() => setPath(path.slice(0, i))} title="Pakeisti atsakymą">
                {a}
              </button>
            </li>
          ))}
        </ol>
      )}
      {isLeaf(node) ? (
        "testId" in node ? (
          <div className="wizard-result">
            <p>
              Rekomenduojame: <strong>{getTest(node.testId).name}</strong>. {node.why}
            </p>
            <div className="prep-actions">
              <button
                className="primary-btn"
                onClick={() => {
                  track("analize_wizard_used", { result_test_id: (node as { testId: string }).testId });
                  onPick((node as { testId: string }).testId);
                }}
              >
                Rinktis šį testą
              </button>
              <OutLink href={GUIDE_URL} location="guide" className="guide-link">
                Kaip pasirinkti statistinį testą? →
              </OutLink>
            </div>
          </div>
        ) : (
          <div className="wizard-result">
            <p>{node.none}</p>
            <ContactLink source="vedlys">Paklauskite statistiko – padėsime →</ContactLink>
          </div>
        )
      ) : (
        <div className="wizard-q">
          <p className="wizard-question">{node.q}</p>
          {node.options.map((o, i) => (
            <button key={i} className="wizard-option" onClick={() => setPath([...path, i])}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
