import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev serves from "/". The production build is served at statistikas.lt/imtis/,
// so it uses that base and writes straight into the site's imtis/ folder (the
// English page goes to imtis/en/), which _quarto.yml copies into docs/imtis/
// (see scripts/build-imtis.ts).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/imtis/" : "/",
  plugins: [react()],
  server: { port: 5175, open: false },
  worker: { format: "es" },
  build: {
    outDir: "../imtis",
    emptyOutDir: true,
    // The English page (/imtis/en/) loads the same bundle; <html lang> picks the language.
    rollupOptions: { input: { lt: "index.html", en: "en/index.html" } },
  },
}));
