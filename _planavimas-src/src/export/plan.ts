// The S&OP workbook: plan (wide), forecast (long), inventory, accuracy, data audit.

import type { Check } from "../engine/audit";
import { DEMAND_LABEL } from "../engine/classify";
import type { Freq } from "../engine/periods";
import { periodLabel } from "../engine/periods";
import type { ItemResult } from "../engine/pipeline";
import { type PlanInputs, inventory, itemBands, itemPlan } from "../engine/plan";
import type { PortfolioRow } from "../engine/portfolio";
import { buildXlsx, type Cell, type Sheet } from "./xlsx";

const round1 = (v: number) => Math.round(v * 10) / 10;
const pct1 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1000) / 10);

const STATUS: Record<Check["status"], string> = { ok: "Tvarkinga", warn: "Dėmesio", fail: "Problema" };

export interface ExportContext {
  results: ItemResult[];
  inputs: PlanInputs;
  freq: Freq;
  last: number;
  level: number;
  checks: Check[];
  portfolio: PortfolioRow[];
  sourceName: string;
}

export async function planWorkbook(ctx: ExportContext): Promise<Blob> {
  const { results, inputs, freq, last, level } = ctx;
  const h = results[0]?.forecast.length ?? 0;
  const labels = Array.from({ length: h }, (_, j) => periodLabel(last + 1 + j, freq));
  const abc = new Map(ctx.portfolio.map((p) => [p.item, p.abc]));

  const planRows: Cell[][] = [["Prekė", "Grupė", ...labels, "Iš viso"]];
  const totals = new Array<number>(h).fill(0);
  for (const r of results) {
    const p = itemPlan(r, inputs);
    p.forEach((v, j) => (totals[j] += v));
    planRows.push([r.item, r.group || null, ...p.map(round1), round1(p.reduce((a, b) => a + b, 0))]);
  }
  planRows.push(["Iš viso", null, ...totals.map(round1), round1(totals.reduce((a, b) => a + b, 0))]);

  const lvl = Math.round(level * 100);
  const longRows: Cell[][] = [
    ["Prekė", "Grupė", "Periodas", "Statistinė prognozė", "Koregavimas, %", "Akcija", "Planas", `Apatinė ${lvl} % riba`, `Viršutinė ${lvl} % riba`],
  ];
  for (const r of results) {
    const p = itemPlan(r, inputs);
    const { lower, upper } = itemBands(r, p, inputs, level);
    const promos = new Set(inputs.promos[r.item] ?? []);
    for (let j = 0; j < h; j++)
      longRows.push([
        r.item,
        r.group || null,
        labels[j],
        round1(r.forecast[j]),
        inputs.adjust[r.item] ?? 0,
        promos.has(j) ? "taip" : "ne",
        round1(p[j]),
        round1(lower[j]),
        round1(upper[j]),
      ]);
  }

  const invRows: Cell[][] = [
    ["Prekė", "Saugos atsarga", `Paklausa per tiekimo laiką (${inputs.leadTime} per.)`, "Užsakymo taškas", "Turimas likutis", "Siūlomas užsakymas"],
  ];
  for (const r of results) {
    const inv = inventory(r, itemPlan(r, inputs), inputs);
    invRows.push([
      r.item,
      Math.ceil(inv.safetyStock),
      Math.ceil(inv.leadDemand),
      Math.ceil(inv.reorderPoint),
      inv.onHand,
      inv.order === null ? null : Math.ceil(inv.order),
    ]);
  }

  const accRows: Cell[][] = [
    ["Prekė", "ABC", "XYZ", "Paklausos tipas", "Sezoniškumas", "Modelis", "Parametrai", "WAPE, %", "MAE", "Poslinkis, %", "MASE", "Išskirtys"],
  ];
  for (const r of results)
    accRows.push([
      r.item,
      abc.get(r.item) ?? null,
      r.xyz,
      DEMAND_LABEL[r.cls],
      r.seasonal ? "taip" : "ne",
      r.modelLabel,
      r.form,
      pct1(r.acc?.wape),
      r.acc ? round1(r.acc.mae) : null,
      pct1(r.acc?.bias),
      r.acc && Number.isFinite(r.acc.mase) ? Math.round(r.acc.mase * 100) / 100 : null,
      r.anomalies.length,
    ]);

  const auditRows: Cell[][] = [["Patikra", "Būsena", "Kiekis", "Aprašymas", "Pavyzdžiai"]];
  for (const c of ctx.checks) auditRows.push([c.title, STATUS[c.status], c.count, c.detail, c.examples.join("; ")]);

  const about: Cell[][] = [
    ["Statistikas.lt Planavimas", ""],
    ["Šaltinis", ctx.sourceName],
    ["Sukurta", new Date().toISOString().slice(0, 10)],
    ["Periodas", freq === "day" ? "diena" : freq === "week" ? "savaitė (ISO)" : "mėnuo"],
    ["Prognozės horizontas", `${h} per. (${labels[0]} – ${labels[h - 1]})`],
    ["Intervalų lygis", `${lvl} %`],
    ["Aptarnavimo lygis", `${Math.round(inputs.serviceLevel * 100)} %`],
    ["Tiekimo laikas", `${inputs.leadTime} per.`],
    ["", ""],
    ["Metodas", "Kiekvienai prekei keli modeliai išbandomi su paskutiniais istorijos periodais (iki 3 atskaitos taškų); parenkamas mažiausią paklaidą turintis modelis ir perskaičiuojamas su visa istorija."],
    ["", "Akcijų periodai iš bazinės paklausos pašalinami interpoliuojant; akcijos efektas – paklausos ir bazės santykio mediana."],
    ["", "Saugos atsarga = z(aptarnavimo lygis) × prognozės paklaidos SN per tiekimo laiką. Užsakymo taškas = paklausa per tiekimo laiką + saugos atsarga."],
    ["", ""],
    ["Pagalba", "https://statistikas.lt/kontaktai.html?tema=partneryste&saltinis=planavimas-excel"],
  ];

  const sheets: Sheet[] = [
    { name: "Planas", rows: planRows, widths: [32, 18] },
    { name: "Prognozė", rows: longRows, widths: [32, 18, 11, 12, 12, 8, 10, 12, 12] },
    { name: "Atsargos", rows: invRows, widths: [32, 14, 18, 16, 14, 16] },
    { name: "Tikslumas", rows: accRows, widths: [32, 6, 6, 16, 12, 30, 40] },
    { name: "Duomenų patikra", rows: auditRows, widths: [30, 12, 8, 90, 60] },
    { name: "Apie", rows: about, widths: [22, 120] },
  ];
  return buildXlsx(sheets);
}

/** Long-format CSV (";" + decimal comma, opens directly in Lithuanian Excel). */
export function planCsv(ctx: ExportContext): string {
  const { results, inputs, freq, last, level } = ctx;
  const h = results[0]?.forecast.length ?? 0;
  const lines = ["preke;grupe;periodas;statistine_prognoze;koregavimas_proc;akcija;planas;apatine_riba;virsutine_riba"];
  const num = (v: number) => String(round1(v)).replace(".", ",");
  const q = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  for (const r of results) {
    const p = itemPlan(r, inputs);
    const { lower, upper } = itemBands(r, p, inputs, level);
    const promos = new Set(inputs.promos[r.item] ?? []);
    for (let j = 0; j < h; j++)
      lines.push(
        [q(r.item), q(r.group), periodLabel(last + 1 + j, freq), num(r.forecast[j]), String(inputs.adjust[r.item] ?? 0), promos.has(j) ? "1" : "0", num(p[j]), num(lower[j]), num(upper[j])].join(";")
      );
  }
  return "﻿" + lines.join("\r\n");
}
