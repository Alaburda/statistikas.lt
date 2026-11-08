// Number formatting. The interface follows the page language (fmt*); the methods
// paragraphs come in both languages whatever the page, so report.ts calls the
// Lithuanian (lt*) and English (en*) versions directly.

import { EN } from "./i18n";

const NBSP = " ";

// ---- Lithuanian: decimal comma, space as thousands separator ----

const ltWhole = new Intl.NumberFormat("lt-LT", { maximumFractionDigits: 0 });

export function ltInt(v: number): string {
  return Number.isFinite(v) ? ltWhole.format(v).replace(/\s/g, NBSP) : "–";
}

export function ltNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "–";
  return new Intl.NumberFormat("lt-LT", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(v)
    .replace(/\s/g, NBSP);
}

/** Up to `digits` decimals, without trailing zeros. */
export function ltShort(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "–";
  return new Intl.NumberFormat("lt-LT", { maximumFractionDigits: digits }).format(v).replace(/\s/g, NBSP);
}

export function ltPct(share: number, digits = 1): string {
  return `${ltShort(share * 100, digits)}${NBSP}%`;
}

// ---- English: decimal point, comma for thousands ----

export function enInt(v: number): string {
  return Number.isFinite(v) ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(v) : "–";
}

/** Up to `digits` decimals, without trailing zeros. */
export function enNum(v: number, digits = 2): string {
  return Number.isFinite(v) ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(v) : "–";
}

function enFixed(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "–";
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

export function enPct(share: number, digits = 1): string {
  return `${enNum(share * 100, digits)}%`;
}

// ---- Interface: the page language ----

export const fmtInt = EN ? enInt : ltInt;
export const fmtNum = EN ? enFixed : ltNum;
export const fmtShort = EN ? enNum : ltShort;
export const fmtPct = EN ? enPct : ltPct;

/** A number written back into an input: no thousands separator, so it parses again. */
export function fmtInput(v: number, digits = 2): string {
  const s = fmtShort(v, digits).replace(/\s/g, "");
  return EN ? s.replace(/,/g, "") : s;
}

/** Plain decimal for R code. */
export const rNum = (v: number) => String(Number(v.toFixed(6)));

export function ltPlural(n: number, forms: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 9 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}

/**
 * Parses what people type: spaces in thousands, a stray % sign, a decimal comma.
 * "1,200" on the English page is twelve hundred; "0,5" is a half on either page.
 */
export function parseNum(s: string): number {
  let t = s.replace(/[\s %]/g, "");
  if (EN && /^-?\d{1,3}(,\d{3})+(\.\d*)?$/.test(t)) t = t.replace(/,/g, "");
  t = t.replace(",", ".");
  return t === "" ? NaN : Number(t);
}
