// Portfolio view: ABC classes on the last year of value, plus the ABC × XYZ matrix.

import { abcClasses } from "./classify";
import type { Freq } from "./periods";
import type { ItemResult } from "./pipeline";

/** Periods in one year at each frequency. */
export const YEAR: Record<Freq, number> = { day: 365, week: 52, month: 12 };

export interface PortfolioRow {
  item: string;
  /** Last-year volume (units). */
  volume: number;
  /** Last-year revenue, when prices are known. */
  revenue: number | null;
  abc: "A" | "B" | "C";
}

export function portfolio(results: ItemResult[], freq: Freq): { rows: PortfolioRow[]; basis: "revenue" | "volume" } {
  const k = YEAR[freq];
  const withPrice = results.some((r) => r.price);
  const rows = results.map((r) => {
    const from = Math.max(0, r.y.length - k);
    let volume = 0;
    let revenue = 0;
    let lastPrice: number | null = null;
    for (let t = 0; t < r.y.length; t++) {
      const p = r.price?.[t] ?? null;
      if (p !== null) lastPrice = p;
      if (t < from) continue;
      volume += r.y[t];
      if (lastPrice !== null) revenue += r.y[t] * lastPrice;
    }
    return { item: r.item, volume, revenue: withPrice ? revenue : null, abc: "C" as "A" | "B" | "C" };
  });
  const basis = withPrice ? "revenue" : "volume";
  const cls = abcClasses(rows.map((r) => (basis === "revenue" ? r.revenue ?? 0 : r.volume)));
  rows.forEach((r, i) => (r.abc = cls[i]));
  return { rows, basis };
}
