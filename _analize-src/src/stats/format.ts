// Lithuanian number/p-value formatting shared by the UI and Word export.
// Conventions: decimal comma, p-values keep the leading zero ("0,034", "< 0,001"),
// percent has a space before the sign ("12,5 %").

/** Replace the ASCII decimal point with the Lithuanian decimal comma. */
function comma(s: string): string {
  return s.replace(".", ",");
}

export function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return "—";
  if (Number.isInteger(n) && Math.abs(n) < 1e6) return String(n);
  return comma(n.toFixed(digits));
}

/** Percentage with a space before the sign: fmtPct(12.5) -> "12,5 %". Input is already in percent units. */
export function fmtPct(n: number, digits = 1): string {
  if (!isFinite(n)) return "—";
  return `${comma(n.toFixed(digits))} %`;
}

/** Lithuanian p-value formatting: "0,034", "< 0,001" (leading zero kept). */
export function fmtP(p: number): string {
  if (!isFinite(p)) return "—";
  if (p < 0.001) return "< 0,001";
  return comma(p.toFixed(3));
}

/**
 * Parenthesised significance remark meant to follow a clause after a comma or
 * as a standalone phrase, e.g. `Skirtumas ${significanceNote(p)}` or
 * `Rezultatas yra ${significanceNote(p)}`:
 *   "statistiškai reikšmingas (α = 0,05)" / "statistiškai nereikšmingas (α = 0,05)".
 * It is the masculine nominative singular form (agrees with "skirtumas", "rezultatas", "ryšys").
 */
export function significanceNote(p: number, alpha = 0.05): string {
  const a = comma(String(alpha));
  return p < alpha
    ? `statistiškai reikšmingas (α = ${a})`
    : `statistiškai nereikšmingas (α = ${a})`;
}

/**
 * Lithuanian plural form selector. `forms` = [singular (1, 21, 31…), few (2–9, 22–29…), many (0, 10–20, 30…)].
 * ltPlural(1, ["eilutė","eilutės","eilučių"]) -> "eilutė"; 5 -> "eilutės"; 12 -> "eilučių"; 21 -> "eilutė".
 */
export function ltPlural(n: number, forms: [string, string, string] | readonly [string, string, string]): string {
  const a = Math.abs(Math.trunc(n));
  const m10 = a % 10;
  const m100 = a % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 9 && !(m100 >= 12 && m100 <= 19)) return forms[1];
  return forms[2];
}
