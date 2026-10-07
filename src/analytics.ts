// Google Analytics 4 (same property as statistikas.lt). Loaded only in
// production builds. NEVER pass dataset contents, file names or variable names
// to track() — only coarse counts and test ids.

const GA_ID = "G-DT3Y3KGPJQ";

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

export function initAnalytics(): void {
  if (!import.meta.env.PROD || typeof document === "undefined" || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js expects the `arguments` object itself, not an array copy.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID);
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

/** Send a custom event; silently does nothing when analytics isn't loaded. */
export function track(event: string, params?: Record<string, string | number>): void {
  try {
    window.gtag?.("event", event, params ?? {});
  } catch {
    /* analytics must never break the app */
  }
}
