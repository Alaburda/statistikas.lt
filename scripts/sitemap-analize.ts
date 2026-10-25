// Quarto post-render step: adds the free apps (/analize/, /planavimas/) to
// sitemap.xml. Quarto only lists pages it renders itself, and the apps are
// copied in as resources.
const outDir = Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") ?? "docs";
const sitemap = `${outDir}/sitemap.xml`;
const urls = ["https://statistikas.lt/analize/", "https://statistikas.lt/planavimas/"];

let xml: string;
try {
  xml = Deno.readTextFileSync(sitemap);
} catch {
  console.log("sitemap-analize: no sitemap.xml, skipping");
  Deno.exit(0);
}

let changed = false;
for (const url of urls) {
  if (xml.includes(`<loc>${url}</loc>`)) continue;
  const entry = `  <url>\n    <loc>${url}</loc>\n    <lastmod>${new Date().toISOString()}</lastmod>\n  </url>\n`;
  xml = xml.replace("</urlset>", `${entry}</urlset>`);
  changed = true;
  console.log(`sitemap-analize: added ${url}`);
}
if (changed) Deno.writeTextFileSync(sitemap, xml);
