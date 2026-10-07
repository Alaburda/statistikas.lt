import type { PlotSpec } from "../types";
import type { PlotTheme } from "../theme";
import { DEFAULT_THEME } from "../theme";

// Pure SVG-string chart renderer. The same markup is injected into the DOM for
// display and rasterised to PNG for the Word export, so colours are explicit
// (no CSS variables) and come from the active PlotTheme.

const W = 640;
const H = 400;
const M = { top: 44, right: 24, bottom: 64, left: 64 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

// Instrument Sans matches the site; the fallbacks are what the Word PNG export
// (SVG rasterised without web fonts) will actually use.
const FONT_STACK = "Instrument Sans, Segoe UI, Arial, sans-serif";

/** Axis tick label with a Lithuanian decimal comma. */
function tickLabel(v: number): string {
  return String(v).replace(".", ",");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function svgWrap(inner: string, title: string, t: PlotTheme): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT_STACK}">
  <rect width="${W}" height="${H}" fill="${t.plotBg}"/>
  <text x="${W / 2}" y="26" text-anchor="middle" font-size="16" font-weight="600" fill="${t.text}">${esc(title)}</text>
  ${inner}
</svg>`;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min];
  const range = max - min;
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step * 1e-9; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks;
}

function yAxis(min: number, max: number, label: string, t: PlotTheme): string {
  const ticks = niceTicks(min, max);
  const sy = (v: number) => M.top + PLOT_H - ((v - min) / (max - min)) * PLOT_H;
  let s = "";
  for (const tk of ticks) {
    const y = sy(tk);
    s += `<line x1="${M.left}" y1="${y}" x2="${M.left + PLOT_W}" y2="${y}" stroke="${t.grid}"/>`;
    s += `<text x="${M.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${t.axis}">${tickLabel(tk)}</text>`;
  }
  s += `<text x="16" y="${M.top + PLOT_H / 2}" text-anchor="middle" font-size="12" fill="${t.text}" transform="rotate(-90 16 ${M.top + PLOT_H / 2})">${esc(label)}</text>`;
  return s;
}

function xAxisLabel(label: string, t: PlotTheme): string {
  return `<text x="${M.left + PLOT_W / 2}" y="${H - 16}" text-anchor="middle" font-size="12" fill="${t.text}">${esc(label)}</text>`;
}

function histogram(spec: Extract<PlotSpec, { kind: "histogram" }>, t: PlotTheme): string {
  const v = spec.values;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const k = Math.max(5, Math.ceil(Math.sqrt(v.length)));
  const binW = (max - min) / k || 1;
  const bins = new Array(k).fill(0);
  for (const x of v) {
    let i = Math.floor((x - min) / binW);
    if (i >= k) i = k - 1;
    if (i < 0) i = 0;
    bins[i]++;
  }
  const maxCount = Math.max(...bins);
  const sx = (x: number) => M.left + ((x - min) / (max - min || 1)) * PLOT_W;
  const sy = (c: number) => M.top + PLOT_H - (c / maxCount) * PLOT_H;
  let bars = "";
  for (let i = 0; i < k; i++) {
    const x0 = sx(min + i * binW);
    const x1 = sx(min + (i + 1) * binW);
    const y = sy(bins[i]);
    bars += `<rect x="${x0 + 1}" y="${y}" width="${Math.max(0, x1 - x0 - 2)}" height="${M.top + PLOT_H - y}" fill="${t.palette[0]}" opacity="0.85"/>`;
  }
  const xticks = niceTicks(min, max);
  let xt = "";
  for (const tk of xticks) {
    xt += `<text x="${sx(tk)}" y="${M.top + PLOT_H + 18}" text-anchor="middle" font-size="11" fill="${t.axis}">${tickLabel(tk)}</text>`;
  }
  const axisLine = `<line x1="${M.left}" y1="${M.top + PLOT_H}" x2="${M.left + PLOT_W}" y2="${M.top + PLOT_H}" stroke="${t.axis}"/>`;
  return svgWrap(yAxis(0, maxCount, "Dažnis", t) + bars + xt + axisLine + xAxisLabel(spec.xLabel, t), spec.title, t);
}

function boxplot(spec: Extract<PlotSpec, { kind: "boxplot" }>, t: PlotTheme): string {
  const all = spec.groups.flatMap((g) => g.values);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.08 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const sy = (v: number) => M.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;
  const n = spec.groups.length;
  const slot = PLOT_W / n;
  const boxW = Math.min(70, slot * 0.5);
  let body = "";
  spec.groups.forEach((g, i) => {
    const sorted = [...g.values].sort((a, b) => a - b);
    const q = (p: number) => {
      const pos = (sorted.length - 1) * p;
      const b = Math.floor(pos);
      const r = pos - b;
      return sorted[b + 1] !== undefined ? sorted[b] + r * (sorted[b + 1] - sorted[b]) : sorted[b];
    };
    const q1 = q(0.25);
    const med = q(0.5);
    const q3 = q(0.75);
    const iqr = q3 - q1;
    const whiskLo = Math.max(sorted[0], q1 - 1.5 * iqr);
    const whiskHi = Math.min(sorted[sorted.length - 1], q3 + 1.5 * iqr);
    const cx = M.left + slot * i + slot / 2;
    const color = t.palette[i % t.palette.length];
    body += `<line x1="${cx}" y1="${sy(whiskLo)}" x2="${cx}" y2="${sy(whiskHi)}" stroke="${t.axis}"/>`;
    body += `<line x1="${cx - boxW / 3}" y1="${sy(whiskLo)}" x2="${cx + boxW / 3}" y2="${sy(whiskLo)}" stroke="${t.axis}"/>`;
    body += `<line x1="${cx - boxW / 3}" y1="${sy(whiskHi)}" x2="${cx + boxW / 3}" y2="${sy(whiskHi)}" stroke="${t.axis}"/>`;
    body += `<rect x="${cx - boxW / 2}" y="${sy(q3)}" width="${boxW}" height="${Math.max(1, sy(q1) - sy(q3))}" fill="${color}" opacity="0.35" stroke="${color}"/>`;
    body += `<line x1="${cx - boxW / 2}" y1="${sy(med)}" x2="${cx + boxW / 2}" y2="${sy(med)}" stroke="${color}" stroke-width="2.5"/>`;
    for (const v of sorted) {
      if (v < whiskLo || v > whiskHi)
        body += `<circle cx="${cx}" cy="${sy(v)}" r="2.5" fill="none" stroke="${color}"/>`;
    }
    body += `<text x="${cx}" y="${M.top + PLOT_H + 18}" text-anchor="middle" font-size="11" fill="${t.axis}">${esc(g.label)}</text>`;
  });
  const axisLine = `<line x1="${M.left}" y1="${M.top + PLOT_H}" x2="${M.left + PLOT_W}" y2="${M.top + PLOT_H}" stroke="${t.axis}"/>`;
  return svgWrap(yAxis(lo, hi, spec.yLabel, t) + body + axisLine, spec.title, t);
}

function scatter(spec: Extract<PlotSpec, { kind: "scatter" }>, t: PlotTheme): string {
  const xs = spec.points.map((p) => p.x);
  const ys = spec.points.map((p) => p.y);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const xpad = (xmax - xmin) * 0.05 || 1;
  const ypad = (ymax - ymin) * 0.05 || 1;
  const xlo = xmin - xpad;
  const xhi = xmax + xpad;
  const ylo = ymin - ypad;
  const yhi = ymax + ypad;
  const sx = (x: number) => M.left + ((x - xlo) / (xhi - xlo)) * PLOT_W;
  const sy = (y: number) => M.top + PLOT_H - ((y - ylo) / (yhi - ylo)) * PLOT_H;
  let pts = "";
  for (const p of spec.points) pts += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="3" fill="${t.palette[0]}" opacity="0.6"/>`;
  let line = "";
  if (spec.line) {
    const y1 = spec.line.intercept + spec.line.slope * xlo;
    const y2 = spec.line.intercept + spec.line.slope * xhi;
    line = `<line x1="${sx(xlo)}" y1="${sy(y1)}" x2="${sx(xhi)}" y2="${sy(y2)}" stroke="${t.palette[1]}" stroke-width="2"/>`;
  }
  const xticks = niceTicks(xmin, xmax);
  let xt = "";
  for (const tk of xticks) {
    xt += `<line x1="${sx(tk)}" y1="${M.top}" x2="${sx(tk)}" y2="${M.top + PLOT_H}" stroke="${t.grid}"/>`;
    xt += `<text x="${sx(tk)}" y="${M.top + PLOT_H + 18}" text-anchor="middle" font-size="11" fill="${t.axis}">${tickLabel(tk)}</text>`;
  }
  const axisLine = `<line x1="${M.left}" y1="${M.top + PLOT_H}" x2="${M.left + PLOT_W}" y2="${M.top + PLOT_H}" stroke="${t.axis}"/>`;
  return svgWrap(yAxis(ylo, yhi, spec.yLabel, t) + xt + line + pts + axisLine + xAxisLabel(spec.xLabel, t), spec.title, t);
}

function bar(spec: Extract<PlotSpec, { kind: "bar" }>, t: PlotTheme): string {
  const cats = spec.series[0]?.values.map((v) => v.x) ?? [];
  const maxY = Math.max(1, ...spec.series.flatMap((s) => s.values.map((v) => v.y)));
  const nCat = cats.length;
  const slot = PLOT_W / nCat;
  const nSeries = spec.series.length;
  const groupW = slot * 0.7;
  const barW = groupW / nSeries;
  const sy = (y: number) => M.top + PLOT_H - (y / maxY) * PLOT_H;
  let body = "";
  cats.forEach((cat, ci) => {
    const x0 = M.left + slot * ci + (slot - groupW) / 2;
    spec.series.forEach((s, si) => {
      const val = s.values[ci]?.y ?? 0;
      const x = x0 + si * barW;
      body += `<rect x="${x + 1}" y="${sy(val)}" width="${Math.max(0, barW - 2)}" height="${M.top + PLOT_H - sy(val)}" fill="${t.palette[si % t.palette.length]}" opacity="0.85"/>`;
    });
    body += `<text x="${M.left + slot * ci + slot / 2}" y="${M.top + PLOT_H + 18}" text-anchor="middle" font-size="11" fill="${t.axis}">${esc(cat)}</text>`;
  });
  let legend = "";
  if (nSeries > 1) {
    spec.series.forEach((s, si) => {
      const lx = M.left + si * 110;
      legend += `<rect x="${lx}" y="${M.top - 16}" width="12" height="12" fill="${t.palette[si % t.palette.length]}" opacity="0.85"/>`;
      legend += `<text x="${lx + 16}" y="${M.top - 6}" font-size="11" fill="${t.text}">${esc(s.label)}</text>`;
    });
  }
  const axisLine = `<line x1="${M.left}" y1="${M.top + PLOT_H}" x2="${M.left + PLOT_W}" y2="${M.top + PLOT_H}" stroke="${t.axis}"/>`;
  return svgWrap(yAxis(0, maxY, spec.yLabel, t) + body + legend + axisLine + xAxisLabel(spec.xLabel, t), spec.title, t);
}

export function renderPlotSvg(spec: PlotSpec, theme: PlotTheme = DEFAULT_THEME.plot): string {
  switch (spec.kind) {
    case "histogram":
      return histogram(spec, theme);
    case "boxplot":
      return boxplot(spec, theme);
    case "scatter":
      return scatter(spec, theme);
    case "bar":
      return bar(spec, theme);
  }
}

export const PLOT_WIDTH = W;
export const PLOT_HEIGHT = H;
