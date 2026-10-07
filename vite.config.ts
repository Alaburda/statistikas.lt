import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base defaults to "/" for local dev. The production build for statistikas.lt
// passes `--base /analize/` on the CLI (see `npm run build:site`).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
});
