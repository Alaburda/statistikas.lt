import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// On GitHub Pages the app is served from /<repo>/, so the CI sets VITE_BASE
// (e.g. "/spss-killer/"). Locally it defaults to "/".
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: { port: 5173, open: true },
});
