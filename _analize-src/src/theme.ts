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
    id: "statistikas",
    name: "Statistikas",
    plot: {
      palette: ["#1F45A0", "#C23B2A", "#E9B93A", "#4A4741", "#1F7A45", "#2A8C94"],
      axis: "#4A4741",
      grid: "#E3E1DC",
      text: "#1C1B19",
      plotBg: "#ffffff",
    },
    ui: {
      brand: "#1F45A0",
      brandDark: "#17357C",
      accent: "#C23B2A",
      thBg: "#1C1B19",
      thText: "#ffffff",
      rowStripe: "#F5F4F1",
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
    id: "slate",
    name: "Spausdinimui",
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
