import { OutLink, ContactLink } from "./Funnel";
import { GUIDE_URL } from "../site";

/** Sizes of the reference grids; verified.test.ts keeps these equal to reference.json. */
export const CHECKS = { tost: 486, compare: 236, abel: 60 };

export function Verified() {
  return (
    <section className="block verified" aria-labelledby="verified-title">
      <h2 id="verified-title">Kuo galima pasitikėti</h2>
      <div className="verified-grid">
        <div>
          <p className="stat">{CHECKS.tost}</p>
          <p>bioekvivalentiškumo scenarijai sutampa su R paketu PowerTOST 1.5-6: tas pats n, ta pati galia iki 6 ženklų.</p>
        </div>
        <div>
          <p className="stat">{CHECKS.compare}</p>
          <p>grupių palyginimo skaičiavimai sutampa su R funkcijomis ir paketu pwr (t testai, ANOVA, proporcijos, koreliacija).</p>
        </div>
        <div>
          <p className="stat">{CHECKS.abel}</p>
          <p>ABEL scenarijai sutikrinti su PowerTOST simuliacijomis: galia skiriasi mažiau nei 0,4 procentinio punkto, n ne daugiau kaip vienu sekų bloku.</p>
        </div>
      </div>
      <p className="block-lead">
        Patikros veikia su kiekvienu įrankio pakeitimu. Prie kiekvieno rezultato pateikiamas R kodas, kad galėtumėte skaičių
        atkartoti patys.
      </p>
      <h3>Ko skaičiuoklė nedaro</h3>
      <p className="block-lead">
        Kartotinių matavimų, klasterizuotų ir daugiacentrių eksperimentų, išgyvenamumo analizės, regresijos modelių, FDA RSABE,
        dviejų etapų ar adaptyvių planų. Šiems tyrimams imtį reikia modeliuoti pagal konkretų dizainą:{" "}
        <ContactLink source="ribos">parašykite</ContactLink>. Apie pačius principus skaitykite{" "}
        <OutLink href={GUIDE_URL}>imties dydžio gide</OutLink>.
      </p>
    </section>
  );
}
