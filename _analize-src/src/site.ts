// Links back to the main statistikas.lt site. Always absolute: the app is also
// served from localhost during development.

export const SITE_URL = "https://statistikas.lt";

/** Contact page with the consultation topic preselected and the CTA source tagged. */
export function contactUrl(source: string): string {
  return `${SITE_URL}/kontaktai.html?tema=konsultacija&saltinis=analize-${source}`;
}

export const SERVICES_URL = `${SITE_URL}/paslaugos.html`;
export const ARTICLES_URL = `${SITE_URL}/straipsniai.html`;
export const CONTACT_EMAIL = "info@statistikas.lt";
