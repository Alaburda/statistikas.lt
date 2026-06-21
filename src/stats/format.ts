// Number/p-value formatting shared by the UI and Word export.

export function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return "—";
  if (Number.isInteger(n) && Math.abs(n) < 1e6) return String(n);
  return n.toFixed(digits);
}

/** APA-style p-value formatting. */
export function fmtP(p: number): string {
  if (!isFinite(p)) return "—";
  if (p < 0.001) return "< .001";
  return p.toFixed(3).replace(/^0/, ""); // .034 not 0.034
}

export function significanceNote(p: number, alpha = 0.05): string {
  return p < alpha
    ? `statistically significant at α = ${alpha}`
    : `not statistically significant at α = ${alpha}`;
}
