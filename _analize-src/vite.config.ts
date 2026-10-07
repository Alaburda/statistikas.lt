import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev serves from "/". The production build is served at statistikas.lt/analize/,
// so it uses that base and writes straight into the site's analize/ folder, which
// _quarto.yml copies into docs/analize/ (see scripts/build-analize.ts).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/analize/" : "/",
  plugins: [react()],
  server: { port: 5173, open: true },
  build: { outDir: "../analize", emptyOutDir: true },
}));
