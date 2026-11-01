// Lithuanian number formatting: decimal comma, space as thousands separator.

const NBSP = " ";

const whole = new Intl.NumberFormat("lt-LT", { maximumFractionDigits: 0 });

export function fmtInt(v: number): string {
  return Number.isFinite(v) ? whole.format(v).replace(/\s/g, NBSP) : "–";
}

export function fmtNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "–";
  return new Intl.NumberFormat("lt-LT", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(v)
    .replace(/\s/g, NBSP);
}

/** Up to `digits` decimals, without trailing zeros. */
export function fmtShort(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "–";
  return new Intl.NumberFormat("lt-LT", { maximumFractionDigits: digits }).format(v).replace(/\s/g, NBSP);
}

export function fmtPct(share: number, digits = 1): string {
  return `${fmtShort(share * 100, digits)}${NBSP}%`;
}

/** Same numbers for the English paragraph: decimal point, comma for thousands. */
export function enInt(v: number): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(v);
}

export function enNum(v: number, digits = 2): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(v);
}

export function enPct(share: number, digits = 1): string {
  return `${enNum(share * 100, digits)}%`;
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

/** Parses what people type: decimal comma, spaces in thousands, a stray % sign. */
export function parseNum(s: string): number {
  const t = s.replace(/[\s %]/g, "").replace(",", ".");
  return t === "" ? NaN : Number(t);
}
