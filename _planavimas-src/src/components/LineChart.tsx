import { useMemo, useRef, useState } from "react";
import { fmtQty } from "../format";

// Time-series chart in plain SVG: history, forecast, an interval band, markers
// for promotions and anomalies, an optional capacity line, and a crosshair
// tooltip that lists every series at the hovered period.

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  dash?: boolean;
  /** First index shown in the tooltip (a forecast line drawn from the last actual starts later). */
  tipFrom?: number;
}

export interface ChartBand {
  label: string;
  lower: (number | null)[];
  upper: (number | null)[];
}

export interface ChartMarker {
  index: number;
  kind: "promo" | "planned" | "anomaly";
}

export const COLORS = {
  actual: "#1C1B19",
  forecast: "#1F45A0",
  band: "rgba(31, 69, 160, 0.14)",
  holdout: "#C23B2A",
  statistical: "#6B675F",
  capacity: "#C23B2A",
  promo: "#E9B93A",
  grid: "#E3E1DC",
  axis: "#4A4741",
};

const W = 880;
const M = { top: 16, right: 16, bottom: 34, left: 56 };

function niceTicks(min: number, max: number, count = 5): number[] {
  if (max <= min) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

export function LineChart({
  n,
  xLabel,
  series,
  band,
  markers = [],
  splitAt,
  refLine,
  height = 300,
  ariaLabel,
}: {
  n: number;
  xLabel: (i: number) => string;
  series: ChartSeries[];
  band?: ChartBand;
  markers?: ChartMarker[];
  /** Index where the forecast starts (draws a divider). */
  splitAt?: number;
  refLine?: { value: number; label: string };
  height?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const H = height;
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;

  const { yMax, ticks } = useMemo(() => {
    let mx = 0;
    for (const s of series) for (const v of s.values) if (v !== null && v > mx) mx = v;
    if (band) for (const v of band.upper) if (v !== null && v > mx) mx = v;
    if (refLine) mx = Math.max(mx, refLine.value);
    const t = niceTicks(0, mx > 0 ? mx * 1.05 : 1);
    return { yMax: Math.max(t[t.length - 1], mx * 1.05, 1), ticks: t };
  }, [series, band, refLine]);

  const sx = (i: number) => M.left + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw);
  const sy = (v: number) => M.top + ph - (v / yMax) * ph;

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const bandPath = useMemo(() => {
    if (!band) return "";
    const idx = band.lower.map((v, i) => (v !== null && band.upper[i] !== null ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return "";
    const top = idx.map((i, k) => `${k ? "L" : "M"}${sx(i).toFixed(1)},${sy(band.upper[i]!).toFixed(1)}`).join("");
    const bottom = idx
      .slice()
      .reverse()
      .map((i) => `L${sx(i).toFixed(1)},${sy(band.lower[i]!).toFixed(1)}`)
      .join("");
    return top + bottom + "Z";
  }, [band, n, yMax]);

  const xTicks = useMemo(() => {
    const k = Math.min(n, 7);
    const out: number[] = [];
    for (let i = 0; i < k; i++) out.push(Math.round((i * (n - 1)) / Math.max(1, k - 1)));
    return [...new Set(out)];
  }, [n]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((x - M.left) / pw) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  const tipLeft = hover !== null ? (sx(hover) / W) * 100 : 0;

  return (
    <div className="chart" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={sy(t)} y2={sy(t)} stroke={COLORS.grid} />
            <text x={M.left - 8} y={sy(t) + 4} textAnchor="end" fontSize="11" fill={COLORS.axis}>
              {fmtQty(t)}
            </text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text
            key={i}
            x={sx(i)}
            y={H - 12}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            fontSize="11"
            fill={COLORS.axis}
          >
            {xLabel(i)}
          </text>
        ))}
        {splitAt !== undefined && splitAt > 0 && splitAt < n && (
          <g>
            <rect
              x={(sx(splitAt - 1) + sx(splitAt)) / 2}
              y={M.top}
              width={W - M.right - (sx(splitAt - 1) + sx(splitAt)) / 2}
              height={ph}
              fill="#F5F4F1"
            />
            <text x={(sx(splitAt - 1) + sx(splitAt)) / 2 + 6} y={M.top + 12} fontSize="11" fill={COLORS.axis}>
              Prognozė
            </text>
          </g>
        )}
        <line x1={M.left} x2={W - M.right} y1={sy(0)} y2={sy(0)} stroke={COLORS.axis} />
        {bandPath && <path d={bandPath} fill={COLORS.band} />}
        {refLine && (
          <g>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={sy(refLine.value)}
              y2={sy(refLine.value)}
              stroke={COLORS.capacity}
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            <text x={W - M.right - 4} y={sy(refLine.value) - 6} textAnchor="end" fontSize="11" fill="#A63222">
              {refLine.label}
            </text>
          </g>
        )}
        {series.map((s) => (
          <path
            key={s.key}
            d={path(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={s.dash ? "5 4" : undefined}
          />
        ))}
        {markers.map((mk, k) =>
          mk.kind === "anomaly" ? (
            <circle
              key={k}
              cx={sx(mk.index)}
              cy={sy(series[0]?.values[mk.index] ?? 0)}
              r={5}
              fill="none"
              stroke={COLORS.holdout}
              strokeWidth={2}
            />
          ) : (
            <rect
              key={k}
              x={sx(mk.index) - 2}
              y={M.top + ph - 7}
              width={4}
              height={7}
              fill={mk.kind === "promo" ? COLORS.promo : COLORS.forecast}
            />
          )
        )}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={sx(hover)} x2={sx(hover)} y1={M.top} y2={M.top + ph} stroke={COLORS.axis} strokeWidth={1} />
            {series.map((s) =>
              s.values[hover] !== null && s.values[hover] !== undefined ? (
                <circle key={s.key} cx={sx(hover)} cy={sy(s.values[hover]!)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
              ) : null
            )}
          </g>
        )}
        <rect x={M.left} y={M.top} width={pw} height={ph} fill="transparent" />
      </svg>
      {hover !== null && (
        <div
          className="chart-tip"
          style={{ left: `${tipLeft}%`, transform: `translateX(${tipLeft > 60 ? "-105%" : "8px"})` }}
          role="status"
        >
          <div className="tip-x">{xLabel(hover)}</div>
          {series.map((s) =>
            s.values[hover] !== null && s.values[hover] !== undefined && hover >= (s.tipFrom ?? 0) ? (
              <div className="tip-row" key={s.key}>
                <span className="tip-key" style={{ background: s.color }} />
                <strong>{fmtQty(s.values[hover]!)}</strong>
                <span>{s.label}</span>
              </div>
            ) : null
          )}
          {band && band.lower[hover] !== null && band.upper[hover] !== null && (
            <div className="tip-row">
              <span className="tip-key tip-band" />
              <strong>
                {fmtQty(band.lower[hover]!)} – {fmtQty(band.upper[hover]!)}
              </strong>
              <span>{band.label}</span>
            </div>
          )}
          {markers.some((m) => m.index === hover && m.kind !== "anomaly") && <div className="tip-note">Akcija</div>}
          {markers.some((m) => m.index === hover && m.kind === "anomaly") && <div className="tip-note">Išskirtis</div>}
        </div>
      )}
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.key}>
            <span className={`legend-line${s.dash ? " legend-dash" : ""}`} style={{ borderColor: s.color }} />
            {s.label}
          </span>
        ))}
        {band && (
          <span>
            <span className="legend-band" />
            {band.label}
          </span>
        )}
        {markers.some((m) => m.kind === "promo") && (
          <span>
            <span className="legend-tick" style={{ background: COLORS.promo }} />
            Akcija
          </span>
        )}
        {markers.some((m) => m.kind === "planned") && (
          <span>
            <span className="legend-tick" style={{ background: COLORS.forecast }} />
            Planuota akcija
          </span>
        )}
        {markers.some((m) => m.kind === "anomaly") && (
          <span>
            <span className="legend-ring" />
            Išskirtis
          </span>
        )}
      </div>
    </div>
  );
}
