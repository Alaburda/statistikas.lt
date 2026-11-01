// Links back to the main statistikas.lt site. Always absolute: the app is also
// served from localhost during development.

export const SITE_URL = "https://statistikas.lt";

/** Contact page with a sample-size project preselected and the CTA source tagged. */
export function contactUrl(source: string, tema: "projektas" | "konsultacija" = "projektas"): string {
  return `${SITE_URL}/kontaktai.html?tema=${tema}&saltinis=imtis-${source}`;
}

export const SERVICES_URL = `${SITE_URL}/paslaugos.html`;
export const ANALIZE_URL = `${SITE_URL}/analize/`;
export const GUIDE_URL = `${SITE_URL}/posts/kaip-apskaiciuoti-imties-dydi/kaip-apskaiciuoti-imties-dydi.html`;
export const CONTACT_EMAIL = "info@statistikas.lt";
