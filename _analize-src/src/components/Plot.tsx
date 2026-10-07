import { useMemo } from "react";
import type { PlotSpec } from "../types";
import { renderPlotSvg } from "../charts/svg";
import { useTheme } from "../theme";

export function Plot({ spec }: { spec: PlotSpec }) {
  const theme = useTheme();
  const svg = useMemo(() => renderPlotSvg(spec, theme.plot), [spec, theme]);
  return <div className="plot" dangerouslySetInnerHTML={{ __html: svg }} />;
}
