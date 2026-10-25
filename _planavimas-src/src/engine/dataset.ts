// Raw table → one regular time series per item. Also collects the row-level
// data-quality findings; series-level checks live in audit.ts.

import { parseNumber } from "../data/csv";
import {
  type Freq,
  coarserOrEqual,
  detectDateOrder,
  detectFreq,
  isoDate,
  parseDate,
  periodOf,
  periodStart,
} from "./periods";

export interface ColumnMap {
  date: number;
  qty: number;
  item: number | null;
  group: number | null;
  price: number | null;
  promo: number | null;
}

export interface SeriesData {
  item: string;
  group: string;
  /** Period index of y[0]. */
  start: number;
  y: number[];
  /** Average selling price per period (revenue-weighted), null when unknown. */
  price: (number | null)[] | null;
  promo: boolean[] | null;
  /** Periods with no rows at all, filled with 0. */
  filled: number;
}

export interface RowIssues {
  rowsTotal: number;
  rowsUsed: number;
  badDate: number[];
  missingQty: number[];
  negativeQty: number[];
  badPrice: number[];
  duplicates: number[];
  clippedPeriods: number;
  droppedPartial: string | null;
}

export interface Prepared {
  freq: Freq;
  dataFreq: Freq;
  /** Last period with (complete) data — the forecast starts right after it. */
  last: number;
  series: SeriesData[];
  issues: RowIssues;
  hasPrice: boolean;
  hasPromo: boolean;
  hasGroup: boolean;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const PATTERNS: Record<Exclude<keyof ColumnMap, never>, RegExp> = {
  date: /^(data|date|diena|day|laikas|period|periodas|savaite|week|menuo|month|ds|timestamp)\b|data$|date$/,
  item: /prek|sku|item|product|produkt|artikul|kodas|code|material|pavadinim|unique_id|^id$/,
  qty: /kiek|qty|quantit|sales|pardav|units|vnt|demand|paklaus|volume|^y$|sold/,
  price: /kain|price|unit_price/,
  promo: /akcij|promo|nuolaid|discount|campaign|kampanij/,
  group: /grup|kategor|categor|segment|brand|zenklas|region|parduotuv|store|family/,
};

/** Guess which column is which from the header names, falling back to the values. */
export function guessMapping(header: string[], rows: string[][], decimalComma: boolean): ColumnMap {
  const used = new Set<number>();
  const find = (key: keyof ColumnMap): number | null => {
    for (let i = 0; i < header.length; i++)
      if (!used.has(i) && PATTERNS[key].test(norm(header[i]))) {
        used.add(i);
        return i;
      }
    return null;
  };
  const sample = rows.slice(0, 200);
  const share = (ci: number, ok: (v: string) => boolean) => {
    const vals = sample.map((r) => r[ci] ?? "").filter((v) => v !== "");
    return vals.length ? vals.filter(ok).length / vals.length : 0;
  };
  let date = find("date");
  const price = find("price");
  const promo = find("promo");
  let qty = find("qty");
  const item = find("item");
  const group = find("group");
  if (date === null) {
    for (let i = 0; i < header.length && date === null; i++) {
      if (used.has(i)) continue;
      const order = detectDateOrder(sample.map((r) => r[i] ?? ""));
      if (share(i, (v) => parseDate(v, order) !== null && !/^\d+$/.test(v)) > 0.8) {
        date = i;
        used.add(i);
      }
    }
  }
  if (qty === null) {
    for (let i = header.length - 1; i >= 0 && qty === null; i--) {
      if (used.has(i)) continue;
      if (share(i, (v) => !Number.isNaN(parseNumber(v, decimalComma))) > 0.9) {
        qty = i;
        used.add(i);
      }
    }
  }
  return { date: date ?? 0, qty: qty ?? Math.min(1, header.length - 1), item, group, price, promo };
}

/** "1", "taip", "yes", "true", "x" or a positive number → true. */
export function parsePromo(raw: string, decimalComma: boolean): boolean {
  const s = norm(raw.trim());
  if (["taip", "yes", "true", "y", "t", "x", "akcija", "promo"].includes(s)) return true;
  const n = parseNumber(raw, decimalComma);
  return !Number.isNaN(n) && n > 0;
}

interface Bucket {
  qty: number;
  revenue: number;
  pricedQty: number;
  priceSum: number;
  priceN: number;
  promo: boolean;
}

const MAX_EXAMPLES = 2000;

function pushRow(arr: number[], row: number) {
  if (arr.length < MAX_EXAMPLES) arr.push(row);
}

/** Days between rows at the data's own frequency (months approximated as 28 for completeness checks). */
const STEP_DAYS: Record<Freq, number> = { day: 1, week: 7, month: 28 };

/**
 * Build regular series from the raw grid (header row first). Rows are summed per
 * item and period; periods with no rows between an item's first sale and the
 * last period are filled with 0. An incomplete final period (e.g. a month that
 * the data only half covers) is dropped when aggregating up.
 */
export function prepare(
  grid: string[][],
  map: ColumnMap,
  decimalComma: boolean,
  freqChoice: Freq | null
): Prepared {
  const rows = grid.slice(1);
  const order = detectDateOrder(rows.slice(0, 500).map((r) => r[map.date] ?? ""));
  const issues: RowIssues = {
    rowsTotal: rows.length,
    rowsUsed: 0,
    badDate: [],
    missingQty: [],
    negativeQty: [],
    badPrice: [],
    duplicates: [],
    clippedPeriods: 0,
    droppedPartial: null,
  };

  interface Parsed {
    day: number;
    item: string;
    group: string;
    qty: number;
    price: number | null;
    promo: boolean;
  }
  const parsed: Parsed[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const rowNo = i + 2; // spreadsheet row number (header is row 1)
    const day = parseDate(r[map.date] ?? "", order);
    if (day === null) {
      pushRow(issues.badDate, rowNo);
      return;
    }
    const qty = parseNumber(r[map.qty] ?? "", decimalComma);
    if (Number.isNaN(qty)) {
      pushRow(issues.missingQty, rowNo);
      return;
    }
    if (qty < 0) pushRow(issues.negativeQty, rowNo);
    let price: number | null = null;
    if (map.price !== null) {
      const p = parseNumber(r[map.price] ?? "", decimalComma);
      if (!Number.isNaN(p) && p > 0) price = p;
      else if ((r[map.price] ?? "") !== "") pushRow(issues.badPrice, rowNo);
    }
    const item = map.item !== null ? (r[map.item] ?? "").trim() || "(be pavadinimo)" : "Visi pardavimai";
    const group = map.group !== null ? (r[map.group] ?? "").trim() || "(be grupės)" : "";
    const key = r.join("\u0001");
    if (seen.has(key)) pushRow(issues.duplicates, rowNo);
    else seen.add(key);
    parsed.push({
      day,
      item,
      group,
      qty,
      price,
      promo: map.promo !== null && parsePromo(r[map.promo] ?? "", decimalComma),
    });
  });
  issues.rowsUsed = parsed.length;
  if (parsed.length === 0)
    throw new Error("Neliko nė vienos eilutės su tinkama data ir kiekiu – patikrinkite stulpelių parinkimą.");

  const dataFreq = detectFreq(parsed.map((p) => p.day));
  const freq = freqChoice && coarserOrEqual(dataFreq).includes(freqChoice) ? freqChoice : dataFreq;

  // Aggregate per item and period.
  const byItem = new Map<string, { group: string; buckets: Map<number, Bucket> }>();
  let maxDay = -Infinity;
  for (const p of parsed) {
    maxDay = Math.max(maxDay, p.day);
    const per = periodOf(p.day, freq);
    let entry = byItem.get(p.item);
    if (!entry) {
      entry = { group: p.group, buckets: new Map() };
      byItem.set(p.item, entry);
    }
    let b = entry.buckets.get(per);
    if (!b) {
      b = { qty: 0, revenue: 0, pricedQty: 0, priceSum: 0, priceN: 0, promo: false };
      entry.buckets.set(per, b);
    }
    b.qty += p.qty;
    if (p.price !== null) {
      b.priceSum += p.price;
      b.priceN++;
      if (p.qty > 0) {
        b.revenue += p.price * p.qty;
        b.pricedQty += p.qty;
      }
    }
    if (p.promo) b.promo = true;
  }

  let last = periodOf(maxDay, freq);
  if (freq !== dataFreq) {
    const coveredTo = maxDay + STEP_DAYS[dataFreq] - 1;
    const periodEnd = periodStart(last + 1, freq) - 1;
    const anyEarlier = parsed.some((p) => periodOf(p.day, freq) < last);
    if (coveredTo < periodEnd && anyEarlier) {
      issues.droppedPartial = `${isoDate(periodStart(last, freq))} – ${isoDate(maxDay)}`;
      last -= 1;
    }
  }

  const hasPrice = map.price !== null && parsed.some((p) => p.price !== null);
  const hasPromo = map.promo !== null && parsed.some((p) => p.promo);
  const series: SeriesData[] = [];
  for (const [item, { group, buckets }] of byItem) {
    const periods = [...buckets.keys()].filter((p) => p <= last);
    if (periods.length === 0) continue;
    const start = Math.min(...periods);
    const n = last - start + 1;
    const y = new Array<number>(n).fill(0);
    const price: (number | null)[] | null = hasPrice ? new Array(n).fill(null) : null;
    const promo: boolean[] | null = hasPromo ? new Array(n).fill(false) : null;
    let filled = 0;
    for (let t = 0; t < n; t++) {
      const b = buckets.get(start + t);
      if (!b) {
        filled++;
        continue;
      }
      if (b.qty < 0) issues.clippedPeriods++;
      y[t] = Math.max(0, b.qty);
      if (price) price[t] = b.pricedQty > 0 ? b.revenue / b.pricedQty : b.priceN ? b.priceSum / b.priceN : null;
      if (promo) promo[t] = b.promo;
    }
    series.push({ item, group, start, y, price, promo, filled });
  }
  series.sort((a, b) => sum(b.y) - sum(a.y));
  return { freq, dataFreq, last, series, issues, hasPrice, hasPromo, hasGroup: map.group !== null };
}

export function sum(a: number[]): number {
  let s = 0;
  for (const v of a) s += v;
  return s;
}
