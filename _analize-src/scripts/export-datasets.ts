// Dumps the built-in demo datasets to scripts/.cache/<id>.json so reference.R
// computes its expected values from exactly the rows the app uses.
// Run from _analize-src/:  npx vite-node scripts/export-datasets.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { DEMOS } from "../src/data/demos";

mkdirSync("scripts/.cache", { recursive: true });
for (const d of DEMOS) {
  writeFileSync(`scripts/.cache/${d.id}.json`, JSON.stringify(d.dataset.rows));
  console.log(`${d.id}: ${d.dataset.rows.length} rows`);
}
