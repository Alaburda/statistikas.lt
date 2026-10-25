// Lithuanian number formatting: decimal comma, space as thousands separator.

const nf0 = new Intl.NumberFormat("lt-LT", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("lt-LT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Quantity: whole units, but one decimal below 10 so slow movers don't read as 0. */
export function fmtQty(v: number): string {
  if (!Number.isFinite(v)) return "–";
  return Math.abs(v) < 10 && v !== Math.round(v) ? nf1.format(v) : nf0.format(v);
}

export function fmtNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "–";
  return digits === 0 ? nf0.format(v) : digits === 1 ? nf1.format(v) : nf2.format(v);
}

export function fmtPct(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return "–";
  return `${(v * 100).toFixed(digits).replace(".", ",")} %`;
}

export function fmtSignedPct(v: number): string {
  if (!Number.isFinite(v)) return "–";
  const s = (v * 100).toFixed(0);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${s.replace("-", "")} %`;
}

export function fmtP(p: number): string {
  if (p < 0.001) return "< 0,001";
  return p.toFixed(3).replace(".", ",");
}

export function ltPlural(n: number, forms: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 9 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}
