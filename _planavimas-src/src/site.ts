// Links back to the main statistikas.lt site. Always absolute: the app is also
// served from localhost during development.

export const SITE_URL = "https://statistikas.lt";

/** Contact page with the retainer topic preselected and the CTA source tagged. */
export function contactUrl(source: string, tema: "partneryste" | "projektas" | "konsultacija" = "partneryste"): string {
  return `${SITE_URL}/kontaktai.html?tema=${tema}&saltinis=planavimas-${source}`;
}

export const SERVICES_URL = `${SITE_URL}/paslaugos.html`;
export const ANALIZE_URL = `${SITE_URL}/analize/`;
export const CONTACT_EMAIL = "info@statistikas.lt";
