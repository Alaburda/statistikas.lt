/** Colours used when drawing plots (also baked into Word PNG exports). */
export interface PlotTheme {
  palette: string[];
  axis: string;
  grid: string;
  text: string;
  plotBg: string;
}

/** The site palette (statistikas.lt Mondrian primaries). */
export const PLOT_THEME: PlotTheme = {
  palette: ["#1F45A0", "#C23B2A", "#E9B93A", "#4A4741", "#1F7A45", "#2A8C94"],
  axis: "#4A4741",
  grid: "#E3E1DC",
  text: "#1C1B19",
  plotBg: "#ffffff",
};
