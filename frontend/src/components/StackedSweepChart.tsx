import { useMemo, useRef, useState } from "react";
import { usePeiraStore } from "../state/store";
import type { Cliff, SweepResult } from "../types";
import {
  BASE_LAYER,
  CHART_CHROME as C,
  CLIFF_COLOR,
  PROGRAM_LAYERS,
} from "../viz/palette";
import { useAnimatedMatrix } from "../viz/useAnimatedMatrix";

const W = 860;
const H = 420;
const M = { top: 46, right: 16, bottom: 34, left: 60 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const fmtK = (v: number) =>
  Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;
const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/** Cumulative stack boundaries: row 0 is the base (earnings after taxes),
 * row k adds program layer k. The last row is household net income. */
function stackBoundaries(sweep: SweepResult): number[][] {
  const n = sweep.x.length;
  const programSum = new Array(n).fill(0);
  for (const layer of PROGRAM_LAYERS) {
    const values = sweep.programs[layer.slug] ?? [];
    for (let i = 0; i < n; i++) programSum[i] += values[i] ?? 0;
  }
  const base = sweep.net_income.map((net, i) => net - programSum[i]);
  const rows = [base];
  for (const layer of PROGRAM_LAYERS) {
    const prev = rows[rows.length - 1];
    const values = sweep.programs[layer.slug] ?? [];
    rows.push(prev.map((v, i) => v + (values[i] ?? 0)));
  }
  return rows;
}

export function StackedSweepChart({ sweep }: { sweep: SweepResult }) {
  const currentIndex = usePeiraStore((s) => s.currentIndex);
  const setCurrentIndex = usePeiraStore((s) => s.setCurrentIndex);
  const selectedCliff = usePeiraStore((s) => s.selectedCliff);
  const selectCliff = usePeiraStore((s) => s.selectCliff);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverPx, setHoverPx] = useState<number | null>(null);

  const target = useMemo(() => stackBoundaries(sweep), [sweep]);
  const rows = useAnimatedMatrix(target);

  const xMin = sweep.x[0];
  const xMax = sweep.x[sweep.x.length - 1];
  const yMin = Math.min(0, ...rows[0]);
  const yMax = Math.max(...sweep.net_income, ...rows[rows.length - 1]) * 1.06;
  const sx = (v: number) => M.left + ((v - xMin) / (xMax - xMin)) * PLOT_W;
  const sy = (v: number) => M.top + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

  const areaPath = (lower: number[], upper: number[]) => {
    const fwd = sweep.x.map((x, i) => `${sx(x)},${sy(upper[i])}`).join(" L");
    const back = [...sweep.x]
      .reverse()
      .map((x, i) => `${sx(x)},${sy(lower[sweep.x.length - 1 - i])}`)
      .join(" L");
    return `M${fwd} L${back} Z`;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const frac = (px - M.left) / PLOT_W;
    const index = Math.round(frac * (sweep.x.length - 1));
    if (index >= 0 && index < sweep.x.length) {
      setCurrentIndex(index);
      setHoverPx(px);
    }
  };
  const onPointerLeave = () => {
    setCurrentIndex(null);
    setHoverPx(null);
  };

  const yTicks = useMemo(() => {
    const step = Math.pow(10, Math.floor(Math.log10(yMax))) / 2;
    const ticks = [];
    for (let v = 0; v <= yMax; v += step) ticks.push(v);
    return ticks;
  }, [yMax]);
  const xTicks = useMemo(() => {
    const span = xMax - xMin;
    const step = span > 60_000 ? 20_000 : 10_000;
    const ticks = [];
    for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) ticks.push(v);
    return ticks;
  }, [xMin, xMax]);

  const idx = currentIndex;

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="stacked-chart"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        {/* grid */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} y1={sy(v)} x2={W - M.right} y2={sy(v)} stroke={C.grid} strokeWidth={1} />
            <text x={M.left - 8} y={sy(v) + 4} textAnchor="end" fontSize={11} fill={C.inkMuted}>
              {fmtK(v)}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={v} x={sx(v)} y={H - M.bottom + 18} textAnchor="middle" fontSize={11} fill={C.inkMuted}>
            {fmtK(v)}
          </text>
        ))}

        {/* base layer: earnings after taxes */}
        <path d={areaPath(new Array(sweep.x.length).fill(0), rows[0])} fill={BASE_LAYER.color} stroke={C.surface} strokeWidth={2} />
        {/* program layers */}
        {PROGRAM_LAYERS.map((layer, k) => (
          <path
            key={layer.slug}
            d={areaPath(rows[k], rows[k + 1])}
            fill={layer.color}
            fillOpacity={0.82}
            stroke={C.surface}
            strokeWidth={2}
          />
        ))}
        {/* net income top edge */}
        <path
          d={`M${sweep.x.map((x, i) => `${sx(x)},${sy(rows[rows.length - 1][i])}`).join(" L")}`}
          fill="none"
          stroke={C.inkPrimary}
          strokeWidth={1.5}
        />

        {/* axis baseline */}
        <line x1={M.left} y1={sy(Math.max(0, yMin))} x2={W - M.right} y2={sy(Math.max(0, yMin))} stroke={C.axis} strokeWidth={1} />

        {/* cliff badges */}
        {sweep.cliffs.map((cliff, i) => {
          const cx = sx(cliff.from_x);
          const topY = sy(rows[rows.length - 1][sweep.x.indexOf(cliff.from_x)]);
          const badgeY = 14 + (i % 2) * 16;
          const isSelected = selectedCliff?.from_x === cliff.from_x;
          return (
            <g
              key={cliff.from_x}
              className="cliff-badge"
              onClick={() => selectCliff(isSelected ? null : cliff, "human")}
            >
              <line x1={cx} y1={badgeY + 6} x2={cx} y2={topY} stroke={CLIFF_COLOR} strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={cx} cy={topY} r={4} fill={CLIFF_COLOR} />
              <text
                x={cx}
                y={badgeY}
                textAnchor="middle"
                fontSize={11}
                fontWeight={isSelected ? 700 : 500}
                fill={isSelected ? C.inkPrimary : CLIFF_COLOR}
              >
                ▼ {fmt(cliff.net_drop)}
              </text>
            </g>
          );
        })}

        {/* crosshair */}
        {idx !== null && (
          <line x1={sx(sweep.x[idx])} y1={M.top} x2={sx(sweep.x[idx])} y2={H - M.bottom} stroke={C.inkSecondary} strokeWidth={1} strokeDasharray="2 3" />
        )}
      </svg>

      {/* tooltip */}
      {idx !== null && hoverPx !== null && (
        <div
          className="chart-tooltip"
          style={{ left: `${(Math.min(hoverPx, W - 220) / W) * 100}%` }}
        >
          <div className="tt-title">
            earnings {fmt(sweep.x[idx])} · net {fmt(sweep.net_income[idx])}
          </div>
          {[...PROGRAM_LAYERS].reverse().map((layer) => {
            const v = sweep.programs[layer.slug]?.[idx] ?? 0;
            if (v < 1) return null;
            return (
              <div key={layer.slug} className="tt-row">
                <span className="swatch" style={{ background: layer.color }} />
                {layer.label} <b>{fmt(v)}</b>
              </div>
            );
          })}
        </div>
      )}

      {/* legend */}
      <div className="legend">
        <span className="legend-item">
          <span className="swatch" style={{ background: BASE_LAYER.color }} />
          {BASE_LAYER.label}
        </span>
        {PROGRAM_LAYERS.map((layer) => (
          <span key={layer.slug} className="legend-item">
            <span className="swatch" style={{ background: layer.color }} />
            {layer.label}
          </span>
        ))}
      </div>

      {/* selected cliff readout */}
      {selectedCliff && <CliffReadout cliff={selectedCliff} />}
    </div>
  );
}

function CliffReadout({ cliff }: { cliff: Cliff }) {
  const deltas = Object.entries(cliff.program_deltas)
    .filter(([, v]) => Math.abs(v) > 1)
    .sort(([, a], [, b]) => a - b);
  return (
    <div className="cliff-readout">
      <div className="tt-title">
        Crossing {fmt(cliff.from_x)} → {fmt(cliff.to_x)}: net {fmt(cliff.net_drop)}
      </div>
      {deltas.map(([slug, v]) => {
        const layer = PROGRAM_LAYERS.find((l) => l.slug === slug);
        return (
          <div key={slug} className="tt-row">
            <span className="swatch" style={{ background: layer?.color ?? C.inkMuted }} />
            {layer?.label ?? slug} <b className={v < 0 ? "neg" : "pos"}>{fmt(v)}</b>
          </div>
        );
      })}
    </div>
  );
}
