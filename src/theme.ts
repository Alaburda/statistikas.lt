import { createContext, useContext } from "react";

/** Colours used when drawing plots (also baked into Word PNG exports). */
export interface PlotTheme {
  palette: string[];
  axis: string;
  grid: string;
  text: string;
  plotBg: string;
}

/** CSS custom-property values applied to the whole UI (chrome + tables). */
export interface UiTheme {
  brand: string;
  brandDark: string;
  accent: string;
  thBg: string;
  thText: string;
  rowStripe: string;
}

export interface Theme {
  id: string;
  name: string;
  plot: PlotTheme;
  ui: UiTheme;
}

export const THEMES: Theme[] = [
  {
    id: "ocean",
    name: "Ocean",
    plot: {
      palette: ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed", "#0891b2"],
      axis: "#475569",
      grid: "#e2e8f0",
      text: "#1e293b",
      plotBg: "#ffffff",
    },
    ui: {
      brand: "#2563eb",
      brandDark: "#1d4ed8",
      accent: "#db2777",
      thBg: "#1e293b",
      thText: "#ffffff",
      rowStripe: "#f8fafc",
    },
  },
  {
    id: "viridis",
    name: "Viridis",
    plot: {
      palette: ["#21918c", "#440154", "#5ec962", "#3b528b", "#fde725", "#90d743"],
      axis: "#3f3f46",
      grid: "#e4e4e7",
      text: "#18181b",
      plotBg: "#ffffff",
    },
    ui: {
      brand: "#21918c",
      brandDark: "#176f6b",
      accent: "#440154",
      thBg: "#27272a",
      thText: "#ffffff",
      rowStripe: "#f4f4f5",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    plot: {
      palette: ["#e11d48", "#f97316", "#f59e0b", "#9333ea", "#0d9488", "#2563eb"],
      axis: "#57534e",
      grid: "#eee6e0",
      text: "#1c1917",
      plotBg: "#ffffff",
    },
    ui: {
      brand: "#e11d48",
      brandDark: "#be123c",
      accent: "#f97316",
      thBg: "#431407",
      thText: "#ffffff",
      rowStripe: "#fff7ed",
    },
  },
  {
    id: "slate",
    name: "Slate (print)",
    plot: {
      palette: ["#0f172a", "#64748b", "#94a3b8", "#334155", "#cbd5e1", "#475569"],
      axis: "#475569",
      grid: "#e2e8f0",
      text: "#0f172a",
      plotBg: "#ffffff",
    },
    ui: {
      brand: "#334155",
      brandDark: "#1e293b",
      accent: "#64748b",
      thBg: "#334155",
      thText: "#ffffff",
      rowStripe: "#f1f5f9",
    },
  },
];

export const DEFAULT_THEME = THEMES[0];

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

export const ThemeContext = createContext<Theme>(DEFAULT_THEME);
export const useTheme = () => useContext(ThemeContext);
