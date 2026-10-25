import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev serves from "/". The production build is served at statistikas.lt/planavimas/,
// so it uses that base and writes straight into the site's planavimas/ folder, which
// _quarto.yml copies into docs/planavimas/ (see scripts/build-planavimas.ts).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/planavimas/" : "/",
  plugins: [react()],
  server: { port: 5174, open: true },
  worker: { format: "es" },
  build: { outDir: "../planavimas", emptyOutDir: true },
}));
