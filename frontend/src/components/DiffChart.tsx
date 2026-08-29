import { useMemo, useRef, useState } from "react";
import { usePeiraStore } from "../state/store";
import type { DiffResult } from "../types";
import { AnnotationPins } from "../viz/AnnotationPins";
import { CHART_CHROME as C } from "../viz/palette";

const W = 860;
const H = 290;
const M = { top: 22, right: 14, bottom: 28, left: 52 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const VARIANT_COLOR = "#1c5cab";

const fmtK = (v: number) =>
  Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;
const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/** Counterfactual overlay: current vs variant net resources, gap shaded. */
export function DiffChart({ diff, label }: { diff: DiffResult; label: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const annotations = usePeiraStore((s) => s.annotations);

  const x = diff.a.x;
  const a = diff.a.net_income;
  const b = diff.b.net_income;
  const xMin = x[0];
  const xMax = x[x.length - 1];
  const yMax = Math.max(...a, ...b) * 1.06;
  const sx = (v: number) => M.left + ((v - xMin) / (xMax - xMin)) * PLOT_W;
  const sy = (v: number) => M.top + PLOT_H - (v / yMax) * PLOT_H;

  const line = (values: number[]) =>
    `M${x.map((xv, i) => `${sx(xv)},${sy(values[i])}`).join(" L")}`;
  const gap = useMemo(() => {
    const fwd = x.map((xv, i) => `${sx(xv)},${sy(a[i])}`).join(" L");
    const back = [...x]
      .reverse()
      .map((xv, i) => `${sx(xv)},${sy(b[x.length - 1 - i])}`)
      .join(" L");
    return `M${fwd} L${back} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff]);

  const yTicks = useMemo(() => {
    const step = Math.pow(10, Math.floor(Math.log10(yMax))) / 2;
    const ticks = [];
    for (let v = 0; v <= yMax; v += step) ticks.push(v);
    return ticks;
  }, [yMax]);

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - M.left) / PLOT_W) * (x.length - 1));
    setIdx(i >= 0 && i < x.length ? i : null);
  };

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="stacked-chart"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setIdx(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} y1={sy(v)} x2={W - M.right} y2={sy(v)} stroke={C.grid} />
            <text x={M.left - 8} y={sy(v) + 4} textAnchor="end" fontSize={11} fill={C.inkMuted}>
              {fmtK(v)}
            </text>
          </g>
        ))}
        <path d={gap} fill="rgba(28, 92, 171, 0.08)" />
        <path d={line(a)} fill="none" stroke={C.inkPrimary} strokeWidth={1.8} />
        <path d={line(b)} fill="none" stroke={VARIANT_COLOR} strokeWidth={1.8} strokeDasharray="6 4" />
        {idx !== null && (
          <line x1={sx(x[idx])} y1={M.top} x2={sx(x[idx])} y2={H - M.bottom} stroke={C.inkSecondary} strokeWidth={1} strokeDasharray="2 3" />
        )}
        <AnnotationPins
          annotations={annotations}
          xMin={xMin}
          xMax={xMax}
          sx={sx}
          yAt={(v) => {
            const nearest = x.reduce(
              (best, xv, i) => (Math.abs(xv - v) < Math.abs(x[best] - v) ? i : best),
              0,
            );
            return sy(Math.max(a[nearest], b[nearest]));
          }}
        />
        <line x1={M.left} y1={sy(0)} x2={W - M.right} y2={sy(0)} stroke={C.axis} />
      </svg>
      {idx !== null && (
        <div className="chart-tooltip" style={{ left: `${(Math.min(sx(x[idx]), W - 240) / W) * 100}%` }}>
          <div className="tt-title">earnings {fmt(x[idx])}</div>
          <div className="tt-row">current <b>{fmt(a[idx])}</b></div>
          <div className="tt-row">{label} <b>{fmt(b[idx])}</b></div>
          <div className="tt-row">
            gap <b className={b[idx] - a[idx] < 0 ? "neg" : "pos"}>{fmt(b[idx] - a[idx])}</b>
          </div>
        </div>
      )}
      <div className="legend">
        <span className="legend-item">
          <span className="swatch" style={{ background: C.inkPrimary }} /> current household
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: VARIANT_COLOR }} /> {label}
        </span>
      </div>
    </div>
  );
}
