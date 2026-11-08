import { useEffect, useMemo, useRef, useState } from "react";
import { fmtInt, fmtPct } from "../format";
import { L, PCT } from "../i18n";

// Power against sample size in plain SVG. Colour is never the only channel: every
// line also has its own dash pattern, a legend entry and a direct label.

export interface CurveSeries {
  label: string;
  color: string;
  dash?: string;
  /** Power (0–1) at each x. */
  values: number[];
}

/** Below this width the end labels go: the legend alone carries identity. */
const NARROW = 560;

function niceStep(range: number): number {
  const raw = range / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

export function PowerCurve({
  xs,
  series,
  target,
  mark,
  xTitle,
  ariaLabel,
}: {
  xs: number[];
  series: CurveSeries[];
  target: number;
  /** The planned n, marked on the first series. */
  mark: number | null;
  xTitle: string;
  ariaLabel: string;
}) {
  const box = useRef<SVGSVGElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at its real pixel width, so text stays 12px on a phone instead of shrinking.
  const [W, setW] = useState(720);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setW(Math.max(el.clientWidth, 260));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const narrow = W < NARROW;
  const H = narrow ? 260 : 320;
  const M = { top: 14, right: narrow ? 12 : 150, bottom: 42, left: 46 };

  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const px = (x: number) => M.left + ((x - xMin) / (xMax - xMin)) * (W - M.left - M.right);
  const py = (y: number) => M.top + (1 - y) * (H - M.top - M.bottom);

  const ticks = useMemo(() => {
    const step = Math.max(1, niceStep((xMax - xMin) * (narrow ? 1.6 : 1)));
    const out: number[] = [];
    for (let t = Math.ceil(xMin / step) * step; t <= xMax; t += step) out.push(t);
    return out;
  }, [xMin, xMax, narrow]);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(px(xs[i]) - x) < Math.abs(px(xs[best]) - x)) best = i;
    setHover(best);
  }

  const markIndex = mark === null ? -1 : xs.findIndex((x) => x >= mark);
  // Curves that saturate together would stack their end labels: spread them top-down.
  const order = series.map((s, i) => ({ i, y: py(s.values[s.values.length - 1]) })).sort((a, b) => a.y - b.y);
  const labelY: number[] = [];
  let previous = -Infinity;
  for (const { i, y } of order) {
    labelY[i] = Math.max(y, previous + 16);
    previous = labelY[i];
  }

  return (
    <div className="curve">
      <ul className="legend">
        {series.map((s) => (
          <li key={s.label}>
            <svg width="26" height="8" aria-hidden="true">
              <line x1="0" x2="26" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
      <div className="curve-frame" ref={frame}>
        <svg
          ref={box}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((y) => (
            <g key={y}>
              <line x1={M.left} x2={W - M.right} y1={py(y)} y2={py(y)} stroke="var(--line)" strokeWidth="1" />
              <text x={M.left - 8} y={py(y) + 4} textAnchor="end" className="tick">
                {y * 100}
                {PCT}
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <text key={t} x={px(t)} y={H - M.bottom + 18} textAnchor="middle" className="tick">
              {fmtInt(t)}
            </text>
          ))}
          <text x={(M.left + W - M.right) / 2} y={H - 4} textAnchor="middle" className="tick">
            {xTitle}
          </text>
          <line x1={M.left} x2={W - M.right} y1={py(target)} y2={py(target)} stroke="var(--ink-2)" strokeWidth="1" />
          <text x={M.left + 6} y={py(target) - 6} className="tick strong">
            {L("tikslas", "target")} {fmtPct(target, 0)}
          </text>
          {series.map((s) => (
            <polyline
              key={s.label}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dash}
              points={s.values.map((v, i) => `${px(xs[i]).toFixed(1)},${py(v).toFixed(1)}`).join(" ")}
            />
          ))}
          {!narrow &&
            series.map((s, i) => (
              <text key={s.label} x={W - M.right + 8} y={labelY[i] + 4} className="tick">
                {s.label}
              </text>
            ))}
          {markIndex >= 0 && (
            <circle
              cx={px(xs[markIndex])}
              cy={py(series[0].values[markIndex])}
              r="5"
              fill={series[0].color}
              stroke="var(--paper)"
              strokeWidth="2"
            />
          )}
          {hover !== null && <line x1={px(xs[hover])} x2={px(xs[hover])} y1={M.top} y2={H - M.bottom} stroke="var(--ink)" strokeWidth="1" />}
        </svg>
        {hover !== null && (
          <div
            className="curve-tip"
            style={{ left: `${(px(xs[hover]) / W) * 100}%`, transform: px(xs[hover]) > W * 0.55 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}
          >
            <div className="tip-n">n = {fmtInt(xs[hover])}</div>
            {series.map((s) => (
              <div key={s.label} className="tip-row">
                <svg width="16" height="6" aria-hidden="true">
                  <line x1="0" x2="16" y1="3" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
                </svg>
                <b>{fmtPct(s.values[hover], 1)}</b> {s.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
