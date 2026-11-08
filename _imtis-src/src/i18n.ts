// Interface language. The Lithuanian page is /imtis/, the English one /imtis/en/;
// both load the same bundle and differ only in <html lang>. Switching language is a
// page load (the hash, with every input, goes along), so the language is a constant.

export type Lang = "lt" | "en";

export const LANG: Lang = typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "lt";
export const EN = LANG === "en";

/** The Lithuanian or English version, by page language. */
export function L<T>(lt: T, en: T): T {
  return EN ? en : lt;
}

/** Lithuanian has three count forms (1, 2–9, 10+ and teens); English two. */
export function plural(n: number, lt: [string, string, string], en: [string, string]): string {
  if (EN) return n === 1 ? en[0] : en[1];
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return lt[0];
  if (n10 >= 2 && n10 <= 9 && (n100 < 10 || n100 >= 20)) return lt[1];
  return lt[2];
}

/** The per cent sign as each language writes it: "5 %" and "5%". */
export const PCT = EN ? "%" : " %";

const BASE = import.meta.env.BASE_URL;

/** The same calculation (hash included) in the other language. */
export function otherLanguageUrl(): string {
  return `${BASE}${EN ? "" : "en/"}${window.location.hash}`;
}
