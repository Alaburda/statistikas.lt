import { useMemo } from "react";
import type { PlotSpec } from "../types";
import { renderPlotSvg } from "../charts/svg";

export function Plot({ spec }: { spec: PlotSpec }) {
  const svg = useMemo(() => renderPlotSvg(spec), [spec]);
  return <div className="plot" dangerouslySetInnerHTML={{ __html: svg }} />;
}
