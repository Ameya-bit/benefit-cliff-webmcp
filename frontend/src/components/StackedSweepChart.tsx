import { useEffect, useMemo, useRef, useState } from "react";
import { usePeiraStore } from "../state/store";
import type { SweepResult } from "../types";
import {
  BASE_LAYER,
  CHART_CHROME as C,
  CLIFF_COLOR,
  PROGRAM_LAYERS,
} from "../viz/palette";
import { AnnotationPins } from "../viz/AnnotationPins";
import { useAnimatedMatrix } from "../viz/useAnimatedMatrix";

// Wide aspect: the map is the ground of the page (roughly the bottom half)
// and the detail cards grow out of it. Rendered near 1:1 scale, so in-chart
// type is sized like page type. Geometry is exported for the connector beams.
const W = 1240;
const H = 320;
const M = { top: 46, right: 14, bottom: 30, left: 56 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

export const CHART_GEOM = { W, H, M };

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
  const trace = usePeiraStore((s) => s.trace);
  const annotations = usePeiraStore((s) => s.annotations);
  const baselineSweep = usePeiraStore((s) => s.baselineSweep);
  const householdEarnings = usePeiraStore((s) =>
    s.household.adults.reduce((a, ad) => a + ad.employment_income, 0),
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverPx, setHoverPx] = useState<number | null>(null);
  // A click on the plot pins the cursor: the money flow below keeps showing
  // that income after the pointer leaves. Click again (near the pin) to release.
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);

  useEffect(() => {
    setPinnedIdx(null);
  }, [sweep]);

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

  const indexAtPointer = (e: React.PointerEvent | React.MouseEvent): number | null => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const frac = (px - M.left) / PLOT_W;
    const index = Math.round(frac * (sweep.x.length - 1));
    return index >= 0 && index < sweep.x.length ? index : null;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const index = indexAtPointer(e);
    if (index !== null) {
      setCurrentIndex(index);
      setHoverPx(px);
    }
  };
  const onPointerLeave = () => {
    setCurrentIndex(pinnedIdx);
    setHoverPx(null);
  };
  const onPlotClick = (e: React.MouseEvent) => {
    const index = indexAtPointer(e);
    if (index === null) return;
    if (pinnedIdx !== null && Math.abs(index - pinnedIdx) <= 1) {
      setPinnedIdx(null);
      return;
    }
    setPinnedIdx(index);
    setCurrentIndex(index);
  };

  const yTicks = useMemo(() => {
    let step = Math.pow(10, Math.floor(Math.log10(yMax))) / 2;
    while (yMax / step > 9) step *= 2;
    const ticks = [];
    for (let v = 0; v <= yMax; v += step) ticks.push(v);
    return ticks;
  }, [yMax]);
  const xTicks = useMemo(() => {
    const span = xMax - xMin;
    const step = span > 120_000 ? 20_000 : 10_000;
    const ticks = [];
    for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) ticks.push(v);
    return ticks;
  }, [xMin, xMax]);

  const idx = currentIndex;
  // net_drop is negative (a loss); the worst cliff is the most negative.
  const worstDrop = Math.min(...sweep.cliffs.map((c) => c.net_drop), 0);

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="stacked-chart"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onPlotClick}
      >
        {/* grid */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} y1={sy(v)} x2={W - M.right} y2={sy(v)} stroke={C.grid} strokeWidth={1} />
            <text x={M.left - 7} y={sy(v) + 4} textAnchor="end" fontSize={13} fill={C.inkSecondary}>
              {fmtK(v)}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={v} x={sx(v)} y={H - M.bottom + 19} textAnchor="middle" fontSize={13} fill={C.inkSecondary}>
            {fmtK(v)}
          </text>
        ))}

        {/* base layer: earnings after taxes */}
        <path d={areaPath(new Array(sweep.x.length).fill(0), rows[0])} fill={BASE_LAYER.color} fillOpacity={0.55} stroke={C.surface} strokeWidth={2} />
        {/* program layers; a live trace dims everything but the binding one */}
        {PROGRAM_LAYERS.map((layer, k) => (
          <path
            key={layer.slug}
            d={areaPath(rows[k], rows[k + 1])}
            fill={layer.color}
            fillOpacity={
              trace ? (trace.dominant_program === layer.slug ? 0.92 : 0.15) : 0.82
            }
            stroke={C.surface}
            strokeWidth={2}
            style={{ transition: "fill-opacity 300ms ease" }}
          />
        ))}
        {/* ghost of the baseline net income while showing an ablated or
            reformed mechanism — the before/after comparison */}
        {baselineSweep && baselineSweep.x.length === sweep.x.length && (
          <path
            d={`M${baselineSweep.x.map((x, i) => `${sx(x)},${sy(baselineSweep.net_income[i])}`).join(" L")}`}
            fill="none"
            stroke={C.inkSecondary}
            strokeWidth={1.2}
            strokeDasharray="5 4"
            opacity={0.7}
          />
        )}
        {/* net income top edge */}
        <path
          d={`M${sweep.x.map((x, i) => `${sx(x)},${sy(rows[rows.length - 1][i])}`).join(" L")}`}
          fill="none"
          stroke={C.inkPrimary}
          strokeWidth={2.2}
        />

        {/* axis baseline */}
        <line x1={M.left} y1={sy(Math.max(0, yMin))} x2={W - M.right} y2={sy(Math.max(0, yMin))} stroke={C.axis} strokeWidth={1} />

        {/* "you are here": the household's actual earnings, anchored to the
            net-income line with the number spelled out */}
        {householdEarnings >= xMin && householdEarnings <= xMax && (() => {
          const youX = sx(householdEarnings);
          const youIdx = sweep.x.reduce(
            (best, xv, i) =>
              Math.abs(xv - householdEarnings) < Math.abs(sweep.x[best] - householdEarnings)
                ? i
                : best,
            0,
          );
          const youY = sy(rows[rows.length - 1][youIdx]);
          return (
            <g pointerEvents="none">
              <line
                x1={youX}
                y1={M.top - 4}
                x2={youX}
                y2={H - M.bottom}
                stroke="#2563eb"
                strokeWidth={1.6}
                opacity={0.9}
              />
              <circle cx={youX} cy={youY} r={5.5} fill="#2563eb" stroke="#ffffff" strokeWidth={2} />
              <text
                x={youX}
                y={M.top - 10}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth={3.5}
                paintOrder="stroke"
              >
                you — {fmtK(householdEarnings)}
              </text>
            </g>
          );
        })()}

        {/* cliff badges — only the worst cliff gets the filled pill */}
        {sweep.cliffs.map((cliff, i) => {
          const cx = sx(cliff.from_x);
          const topY = sy(rows[rows.length - 1][sweep.x.indexOf(cliff.from_x)]);
          const badgeY = 12 + (i % 2) * 18;
          const isSelected = selectedCliff?.from_x === cliff.from_x;
          const isWorst = cliff.net_drop === worstDrop;
          const pill = isWorst || isSelected;
          return (
            <g
              key={cliff.from_x}
              className={`cliff-badge${isSelected ? " selected" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                selectCliff(isSelected ? null : cliff, "human");
              }}
            >
              {/* generous invisible hit area — the badge is a control */}
              <rect x={cx - 38} y={badgeY - 12} width={76} height={23} fill="transparent" />
              <line x1={cx} y1={badgeY + 10} x2={cx} y2={topY} stroke={CLIFF_COLOR} strokeWidth={0.9} strokeDasharray="3 3" opacity={0.55} />
              <circle cx={cx} cy={topY} r={4} fill={CLIFF_COLOR} />
              {pill && (
                <rect
                  className="badge-pill"
                  x={cx - 36}
                  y={badgeY - 10.5}
                  width={72}
                  height={21}
                  rx={10.5}
                  fill={isSelected ? CLIFF_COLOR : "rgba(204,59,59,0.08)"}
                  stroke={CLIFF_COLOR}
                  strokeWidth={isSelected ? 1.4 : 1}
                />
              )}
              <text
                x={cx}
                y={badgeY + 4.5}
                textAnchor="middle"
                fontSize={12.5}
                fontWeight={600}
                fill={isSelected ? "#ffffff" : CLIFF_COLOR}
              >
                ▼ {fmtK(Math.abs(cliff.net_drop))}
              </text>
            </g>
          );
        })}

        {/* trace point marker */}
        {trace && trace.at >= xMin && trace.at <= xMax && (
          <line
            x1={sx(trace.at)}
            y1={M.top}
            x2={sx(trace.at)}
            y2={H - M.bottom}
            stroke={PROGRAM_LAYERS.find((l) => l.slug === trace.dominant_program)?.color ?? C.inkPrimary}
            strokeWidth={1.5}
          />
        )}

        {/* annotation pins */}
        <AnnotationPins
          annotations={annotations}
          xMin={xMin}
          xMax={xMax}
          sx={sx}
          yAt={(v) => {
            const nearest = sweep.x.reduce(
              (best, xv, i) =>
                Math.abs(xv - v) < Math.abs(sweep.x[best] - v) ? i : best,
              0,
            );
            return sy(rows[rows.length - 1][nearest]);
          }}
        />

        {/* pinned cursor: the income the money flow below is showing */}
        {pinnedIdx !== null && (
          <g pointerEvents="none">
            <line
              x1={sx(sweep.x[pinnedIdx])}
              y1={M.top}
              x2={sx(sweep.x[pinnedIdx])}
              y2={H - M.bottom}
              stroke={C.inkPrimary}
              strokeWidth={1.4}
            />
            <text
              x={sx(sweep.x[pinnedIdx])}
              y={H - M.bottom - 8}
              textAnchor="middle"
              fontSize={12}
              fontWeight={600}
              fill={C.inkPrimary}
              stroke="#ffffff"
              strokeWidth={3.5}
              paintOrder="stroke"
            >
              viewing {fmtK(sweep.x[pinnedIdx])} · click to release
            </text>
          </g>
        )}

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
            earnings {fmt(sweep.x[idx])} · keeps {fmt(sweep.net_income[idx])}
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

    </div>
  );
}
