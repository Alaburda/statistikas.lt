// Synthetic demo: weekly sales of a household-goods wholesaler, three years,
// 18 items. Built deterministically (seeded RNG) so the demo is the same for
// every visitor, and covers each pattern the tool handles: summer and winter
// seasonality, trend, promotions with price cuts, price elasticity,
// intermittent spare parts, a new launch, a discontinued item and two data errors.

import { dayFromYmd, isoDate } from "../engine/periods";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spec {
  item: string;
  group: string;
  base: number;
  /** Yearly growth (0.1 = +10 %/year). */
  trend: number;
  /** Seasonal amplitude and the ISO week of the peak. */
  amp: number;
  peak: number;
  price: number;
  elasticity: number;
  /** Probability of a promotion week (20 % price cut plus a display effect). */
  promoRate: number;
  /** Probability that a week has any demand (intermittent items < 1). */
  occur: number;
  /** Noise: coefficient of variation of the sizes. */
  noise: number;
  startWeek?: number;
  endWeek?: number;
}

const SPECS: Spec[] = [
  { item: "Mineralinis vanduo 1,5 l", group: "Gėrimai", base: 820, trend: 0.04, amp: 0.25, peak: 29, price: 0.79, elasticity: -0.6, promoRate: 0.06, occur: 1, noise: 0.08 },
  { item: "Gaivusis gėrimas 0,5 l", group: "Gėrimai", base: 430, trend: 0.12, amp: 0.55, peak: 28, price: 1.29, elasticity: -1.4, promoRate: 0.08, occur: 1, noise: 0.12 },
  { item: "Ledinė arbata 1 l", group: "Gėrimai", base: 210, trend: 0.0, amp: 0.8, peak: 30, price: 1.59, elasticity: -1.2, promoRate: 0.06, occur: 1, noise: 0.15 },
  { item: "Kava, pupelės 1 kg", group: "Maistas", base: 160, trend: 0.06, amp: 0.12, peak: 50, price: 17.9, elasticity: -1.8, promoRate: 0.1, occur: 1, noise: 0.1 },
  { item: "Šokoladas 100 g", group: "Maistas", base: 300, trend: 0.02, amp: 0.45, peak: 51, price: 2.19, elasticity: -1.1, promoRate: 0.08, occur: 1, noise: 0.12 },
  { item: "Žalioji arbata 100 g", group: "Maistas", base: 45, trend: 0.08, amp: 0.2, peak: 3, price: 3.49, elasticity: -0.8, promoRate: 0.04, occur: 1, noise: 0.25 },
  { item: "Indų ploviklis 1 l", group: "Buitis", base: 260, trend: 0.03, amp: 0.05, peak: 10, price: 2.99, elasticity: -2.1, promoRate: 0.12, occur: 1, noise: 0.1 },
  { item: "Skystas muilas 300 ml", group: "Buitis", base: 140, trend: -0.02, amp: 0.15, peak: 6, price: 1.99, elasticity: -0.9, promoRate: 0.05, occur: 1, noise: 0.12 },
  { item: "Malkų briketai 10 kg", group: "Sezoninės", base: 120, trend: 0.05, amp: 0.95, peak: 2, price: 4.9, elasticity: -0.5, promoRate: 0.0, occur: 1, noise: 0.2 },
  { item: "Grilio anglys 5 kg", group: "Sezoninės", base: 70, trend: 0.0, amp: 0.95, peak: 26, price: 6.5, elasticity: -0.7, promoRate: 0.05, occur: 0.9, noise: 0.45 },
  { item: "Ledo grandiklis", group: "Sezoninės", base: 18, trend: 0.0, amp: 0.95, peak: 3, price: 3.9, elasticity: -0.4, promoRate: 0, occur: 0.75, noise: 0.5 },
  { item: "Sodo žarna 25 m", group: "Sezoninės", base: 9, trend: 0.0, amp: 0.9, peak: 20, price: 24.9, elasticity: -0.8, promoRate: 0, occur: 0.55, noise: 0.35 },
  { item: "Sniego kastuvas", group: "Sezoninės", base: 6, trend: 0.0, amp: 0.95, peak: 2, price: 19.9, elasticity: -0.3, promoRate: 0, occur: 0.35, noise: 0.8 },
  { item: "Atsarginė dalis X-200", group: "Atsarginės dalys", base: 3, trend: 0, amp: 0, peak: 1, price: 42, elasticity: 0, promoRate: 0, occur: 0.3, noise: 0.3 },
  { item: "Atsarginė dalis X-310", group: "Atsarginės dalys", base: 5, trend: 0, amp: 0, peak: 1, price: 65, elasticity: 0, promoRate: 0, occur: 0.2, noise: 0.9 },
  { item: "Filtras F-12", group: "Atsarginės dalys", base: 11, trend: 0.1, amp: 0, peak: 1, price: 8.5, elasticity: 0, promoRate: 0, occur: 0.85, noise: 0.3 },
  { item: "Energinis gėrimas 0,25 l", group: "Gėrimai", base: 150, trend: 0.6, amp: 0.3, peak: 28, price: 1.49, elasticity: -1.3, promoRate: 0.08, occur: 1, noise: 0.12, startWeek: 128 },
  { item: "Sieninis kalendorius 2026", group: "Buitis", base: 35, trend: 0, amp: 0.8, peak: 52, price: 6.9, elasticity: -0.5, promoRate: 0, occur: 0.9, noise: 0.3, endWeek: 146 },
];

/** Gamma-ish multiplicative noise with mean 1 and the given CV (via a log-normal). */
function noiseFactor(rnd: () => number, cv: number): number {
  const s2 = Math.log(1 + cv * cv);
  const u1 = Math.max(rnd(), 1e-12);
  const u2 = rnd();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(Math.sqrt(s2) * z - s2 / 2);
}

export const DEMO_WEEKS = 156;
/** The demo ends on the Monday of the last complete week before 2026-10-19. */
const LAST_MONDAY = dayFromYmd(2026, 10, 12);

/** The demo as a string grid (header first), like a parsed CSV. */
export function demoGrid(): string[][] {
  const rnd = mulberry32(20261025);
  const grid: string[][] = [["data", "prekė", "grupė", "kiekis", "kaina", "akcija"]];
  const firstMonday = LAST_MONDAY - (DEMO_WEEKS - 1) * 7;
  for (const s of SPECS) {
    let price = s.price;
    for (let w = 0; w < DEMO_WEEKS; w++) {
      if ((s.startWeek !== undefined && w < s.startWeek) || (s.endWeek !== undefined && w > s.endWeek)) continue;
      const day = firstMonday + w * 7;
      // Shelf-price increases roughly once a year (inflation), occasionally a cut.
      if (w > 0 && w % 52 === 20) price *= 1.04 + 0.04 * rnd();
      if (w === 100 && s.elasticity < -1.5) price *= 0.93;
      // Quarterly shelf-price reviews move the price a few percent either way.
      if (w > 0 && w % 13 === 6) price *= 1 + 0.12 * (rnd() - 0.5);
      const promo = rnd() < s.promoRate && w < DEMO_WEEKS - 2;
      const paid = promo ? price * 0.8 : price;
      const isoW = ((w + 41) % 52) + 1; // the demo starts in ISO week 42
      const season = 1 + s.amp * Math.cos((2 * Math.PI * (isoW - s.peak)) / 52);
      const seasonal = s.amp >= 0.9 ? Math.max(0.03, season - 0.15) : season;
      const growth = Math.pow(1 + s.trend, w / 52);
      const launch = s.startWeek !== undefined ? Math.min(1, (w - s.startWeek + 1) / 10) : 1;
      const priceEffect = Math.pow(paid / s.price, s.elasticity);
      const display = promo ? 1.25 : 1;
      const mu = s.base * seasonal * growth * launch * priceEffect * display;
      let qty: number;
      if (s.occur < 1) {
        const pOcc = Math.min(1, s.occur * (s.amp > 0 ? seasonal : 1));
        qty = rnd() < pOcc ? Math.max(1, Math.round((mu / Math.max(s.occur, 0.05)) * noiseFactor(rnd, s.noise))) : 0;
      } else {
        qty = Math.max(0, Math.round(mu * noiseFactor(rnd, s.noise)));
      }
      // Two deliberate data errors for the audit: a typo spike and a stock-out week.
      if (s.item === "Mineralinis vanduo 1,5 l" && w === 88) qty *= 4;
      if (s.item === "Kava, pupelės 1 kg" && w === 120) qty = 0;
      // Zero weeks are simply missing from an ERP export.
      if (qty === 0) continue;
      grid.push([isoDate(day), s.item, s.group, String(qty), paid.toFixed(2), promo ? "1" : "0"]);
    }
  }
  // One duplicated export row.
  grid.push(grid[400].slice());
  return grid;
}

/** The demo as CSV text (";"-separated with a decimal comma, like Lithuanian Excel). */
export function demoCsv(): string {
  return demoGrid()
    .map((r, i) => r.map((v, j) => (i > 0 && j === 4 ? v.replace(".", ",") : v)).join(";"))
    .join("\r\n");
}
