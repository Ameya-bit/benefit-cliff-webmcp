import { useState } from "react";
import type { HeatmapResult } from "../types";
import { CHART_CHROME as C } from "../viz/palette";

const W = 860;
const H = 440;
const M = { top: 24, right: 16, bottom: 40, left: 64 };

const fmtK = (v: number) => `$${Math.round(v / 1000)}k`;
const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/** Sequential single-hue ramp (blue), dark -> light with magnitude. */
function rampColor(t: number): string {
  const lo = [13, 54, 107]; // #0d366b
  const hi = [205, 226, 251]; // #cde2fb
  const c = lo.map((l, i) => Math.round(l + (hi[i] - l) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Net resources over earnings × childcare cost; cliffs appear as ridges. */
export function HeatmapChart({ heatmap }: { heatmap: HeatmapResult }) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const rows = heatmap.net_income;
  const ny = rows.length;
  const nx = rows[0].length;
  const flat = rows.flat();
  const vMin = Math.min(...flat);
  const vMax = Math.max(...flat);
  const cellW = (W - M.left - M.right) / nx;
  const cellH = (H - M.top - M.bottom) / ny;
  const xAt = (j: number) =>
    heatmap.axis_x.min + (j / (nx - 1)) * (heatmap.axis_x.max - heatmap.axis_x.min);
  const yAt = (i: number) =>
    heatmap.axis_y.min + (i / (ny - 1)) * (heatmap.axis_y.max - heatmap.axis_y.min);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="stacked-chart" onPointerLeave={() => setHover(null)}>
        {rows.map((row, i) =>
          row.map((v, j) => (
            <rect
              key={`${i}-${j}`}
              x={M.left + j * cellW}
              y={M.top + (ny - 1 - i) * cellH}
              width={cellW + 0.5}
              height={cellH + 0.5}
              fill={rampColor((v - vMin) / (vMax - vMin || 1))}
              onPointerEnter={() => setHover({ i, j })}
            />
          )),
        )}
        {hover && (
          <rect
            x={M.left + hover.j * cellW}
            y={M.top + (ny - 1 - hover.i) * cellH}
            width={cellW}
            height={cellH}
            fill="none"
            stroke={C.inkPrimary}
            strokeWidth={1.5}
          />
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text
            key={`x${t}`}
            x={M.left + t * (W - M.left - M.right)}
            y={H - M.bottom + 18}
            textAnchor="middle"
            fontSize={11}
            fill={C.inkMuted}
          >
            {fmtK(heatmap.axis_x.min + t * (heatmap.axis_x.max - heatmap.axis_x.min))}
          </text>
        ))}
        {[0, 0.5, 1].map((t) => (
          <text
            key={`y${t}`}
            x={M.left - 8}
            y={M.top + (1 - t) * (H - M.top - M.bottom) + 4}
            textAnchor="end"
            fontSize={11}
            fill={C.inkMuted}
          >
            {fmtK(heatmap.axis_y.min + t * (heatmap.axis_y.max - heatmap.axis_y.min))}
          </text>
        ))}
        <text x={W - M.right} y={H - 6} textAnchor="end" fontSize={11} fill={C.inkMuted}>
          yearly earnings →
        </text>
        <text x={12} y={M.top - 8} fontSize={11} fill={C.inkMuted}>
          childcare cost ↑ · net resources: dark {fmt(vMin)} → light {fmt(vMax)}
        </text>
      </svg>
      {hover && (
        <div className="chart-tooltip" style={{ left: `${(Math.min(M.left + hover.j * cellW, W - 240) / W) * 100}%` }}>
          <div className="tt-title">net {fmt(rows[hover.i][hover.j])}</div>
          <div className="tt-row">earnings <b>{fmt(xAt(hover.j))}</b></div>
          <div className="tt-row">childcare cost <b>{fmt(yAt(hover.i))}</b></div>
        </div>
      )}
    </div>
  );
}
