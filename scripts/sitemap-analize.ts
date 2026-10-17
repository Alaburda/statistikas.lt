// Quarto post-render step: adds the free analysis app to sitemap.xml. Quarto only
// lists pages it renders itself, and analize/ is copied in as a resource.
const outDir = Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") ?? "docs";
const sitemap = `${outDir}/sitemap.xml`;
const url = "https://statistikas.lt/analize/";

let xml: string;
try {
  xml = Deno.readTextFileSync(sitemap);
} catch {
  console.log("sitemap-analize: no sitemap.xml, skipping");
  Deno.exit(0);
}

if (!xml.includes(`<loc>${url}</loc>`)) {
  const entry = `  <url>\n    <loc>${url}</loc>\n    <lastmod>${new Date().toISOString()}</lastmod>\n  </url>\n`;
  Deno.writeTextFileSync(sitemap, xml.replace("</urlset>", `${entry}</urlset>`));
  console.log("sitemap-analize: added /analize/");
}
