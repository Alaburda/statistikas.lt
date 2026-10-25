// The S&OP layer on top of the statistical forecast: planner adjustments,
// promotions, portfolio totals, capacity gaps and inventory parameters.

import { zFor } from "./pipeline";
import type { ItemResult } from "./pipeline";

export interface PlanInputs {
  /** Planner adjustment per item, in % (+10 = 10 % above the statistical forecast). */
  adjust: Record<string, number>;
  /** Planned promotions per item: horizon step indices (0-based). */
  promos: Record<string, number[]>;
  /** Units on hand per item (optional). */
  onHand: Record<string, number>;
  serviceLevel: number;
  /** Supplier lead time in periods. */
  leadTime: number;
  /** Capacity per period for the whole portfolio, or null. */
  capacity: number | null;
}

export const EMPTY_INPUTS: PlanInputs = {
  adjust: {},
  promos: {},
  onHand: {},
  serviceLevel: 0.95,
  leadTime: 2,
  capacity: null,
};

/** Final plan for one item: statistical forecast × planner adjustment × promotion uplift. */
export function itemPlan(r: ItemResult, inp: PlanInputs): number[] {
  const adj = 1 + (inp.adjust[r.item] ?? 0) / 100;
  const promo = new Set(inp.promos[r.item] ?? []);
  const uplift = r.promoUplift ?? 1;
  return r.forecast.map((f, j) => f * adj * (promo.has(j) ? uplift : 1));
}

export interface Inventory {
  safetyStock: number;
  /** Expected demand over the lead time. */
  leadDemand: number;
  reorderPoint: number;
  /** Suggested order now (only when stock on hand is known). */
  order: number | null;
  onHand: number | null;
}

/**
 * Safety stock = z(service level) · σ over the lead time, where σ² is the sum of
 * the per-step forecast error variances; reorder point = lead-time demand +
 * safety stock. With stock on hand, the order tops up to the reorder point plus
 * one period of demand (a periodic review of one period).
 */
export function inventory(r: ItemResult, plan: number[], inp: PlanInputs): Inventory {
  const L = Math.max(1, Math.round(inp.leadTime));
  const adj = 1 + (inp.adjust[r.item] ?? 0) / 100;
  let v = 0;
  let lead = 0;
  for (let j = 0; j < L; j++) {
    const sd = (r.sd[Math.min(j, r.sd.length - 1)] ?? 0) * adj;
    v += sd * sd;
    lead += plan[Math.min(j, plan.length - 1)] ?? 0;
  }
  const ss = zFor(2 * inp.serviceLevel - 1) * Math.sqrt(v);
  const rop = lead + ss;
  const has = Object.prototype.hasOwnProperty.call(inp.onHand, r.item);
  const onHand = has ? inp.onHand[r.item] : null;
  const review = plan[Math.min(L, plan.length - 1)] ?? 0;
  return {
    safetyStock: ss,
    leadDemand: lead,
    reorderPoint: rop,
    onHand,
    order: onHand === null ? null : Math.max(0, rop + review - onHand),
  };
}

export interface TotalSeries {
  /** First period of the history. */
  start: number;
  history: number[];
  plan: number[];
  statistical: number[];
  lower: number[];
  upper: number[];
}

/**
 * Portfolio totals. Interval bounds assume independent item errors
 * (sd_total = √Σ sd²), which is optimistic when items move together.
 */
export function totals(results: ItemResult[], inp: PlanInputs, last: number, level: number): TotalSeries {
  const start = Math.min(...results.map((r) => r.start));
  const n = last - start + 1;
  const history = new Array<number>(n).fill(0);
  const h = results[0]?.forecast.length ?? 0;
  const plan = new Array<number>(h).fill(0);
  const statistical = new Array<number>(h).fill(0);
  const varr = new Array<number>(h).fill(0);
  for (const r of results) {
    const off = r.start - start;
    r.y.forEach((v, t) => (history[off + t] += v));
    const p = itemPlan(r, inp);
    const adj = 1 + (inp.adjust[r.item] ?? 0) / 100;
    for (let j = 0; j < h; j++) {
      plan[j] += p[j];
      statistical[j] += r.forecast[j];
      varr[j] += ((r.sd[j] ?? 0) * adj) ** 2;
    }
  }
  const z = zFor(level);
  return {
    start,
    history,
    plan,
    statistical,
    lower: plan.map((p, j) => Math.max(0, p - z * Math.sqrt(varr[j]))),
    upper: plan.map((p, j) => p + z * Math.sqrt(varr[j])),
  };
}

/** Item intervals at a given level, adjustments included. */
export function itemBands(r: ItemResult, plan: number[], inp: PlanInputs, level: number) {
  const z = zFor(level);
  const adj = 1 + (inp.adjust[r.item] ?? 0) / 100;
  return {
    lower: plan.map((p, j) => Math.max(0, p - z * r.sd[j] * adj)),
    upper: plan.map((p, j) => p + z * r.sd[j] * adj),
  };
}
