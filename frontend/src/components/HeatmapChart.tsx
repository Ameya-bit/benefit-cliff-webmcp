import { useRef, useState } from "react";
import { usePeiraStore } from "../state/store";
import type { HeatmapResult } from "../types";
import { CHART_CHROME as C, CLIFF_COLOR, programLabel } from "../viz/palette";
import { useFittedHeight } from "../viz/useFittedBox";

const W = 1240;
const FALLBACK_H = 330;
const M = { top: 30, right: 14, bottom: 36, left: 128 };
const ROW_GAP = 12;

/** A step down this big (along rising earnings) is drawn as a cliff drop. */
const RIDGE_DROP = -1500;

const fmtK = (v: number) => `$${Math.round(v / 1000)}k`;
const fmt = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;

/** The earnings × childcare view as SMALL MULTIPLES of the income map the
 * user already knows: the same net-resources profile drawn at five daycare
 * costs (the exact rows the sweep_2d reply samples for the agent), stacked
 * on one shared earnings axis. Cliffs are red drops on each line, so "the
 * childcare wall appears once daycare costs real money" is read the same
 * way the main map is read — not decoded from a color field. */
export function HeatmapChart({ heatmap }: { heatmap: HeatmapResult }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const H = useFittedHeight(svgRef, W, FALLBACK_H, 220, 560);
  const [hover, setHover] = useState<{ level: number; j: number } | null>(null);
  const household = usePeiraStore((s) => s.household);
  const sweepCliffs = usePeiraStore((s) => s.sweep?.cliffs);

  const rows = heatmap.net_income;
  const ny = rows.length;
  const nx = rows[0].length;
  const yAt = (i: number) =>
    heatmap.axis_y.min + (i / (ny - 1)) * (heatmap.axis_y.max - heatmap.axis_y.min);
  const xAt = (j: number) =>
    heatmap.axis_x.min + (j / (nx - 1)) * (heatmap.axis_x.max - heatmap.axis_x.min);

  // Same sampling as the agent's reply (heatmapRidges): five childcare
  // levels from $0 to the axis max, drawn top-down from most expensive.
  const sampled = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => Math.round(f * (ny - 1)))
    .filter((v, i, arr) => arr.indexOf(v) === i);
  const levels = [...sampled].reverse();

  const childcare = household.children.reduce((a, c) => a + c.yearly_childcare_expenses, 0);
  const youLevel = levels.reduce(
    (best, i, k) => (Math.abs(yAt(i) - childcare) < Math.abs(yAt(levels[best]) - childcare) ? k : best),
    0,
  );
  const earnings = household.adults.reduce((a, ad) => a + ad.employment_income, 0);
  const inX = earnings >= heatmap.axis_x.min && earnings <= heatmap.axis_x.max;

  // One shared value scale across all rows, so the profiles are comparable
  // and a higher daycare cost visibly sits lower.
  const shown = levels.flatMap((i) => rows[i]);
  const vMax = Math.max(...shown);
  const vLo = Math.min(...shown) - (vMax - Math.min(...shown)) * 0.1;
  const plotW = W - M.left - M.right;
  const bandH = (H - M.top - M.bottom - ROW_GAP * (levels.length - 1)) / levels.length;
  const sx = (j: number) => M.left + (j / (nx - 1)) * plotW;
  const bandTop = (k: number) => M.top + k * (bandH + ROW_GAP);
  const sy = (v: number, k: number) =>
    bandTop(k) + bandH - ((v - vLo) / (vMax - vLo || 1)) * bandH;
  const xOf = (x: number) =>
    M.left + ((x - heatmap.axis_x.min) / (heatmap.axis_x.max - heatmap.axis_x.min || 1)) * plotW;

  const rowDrops = (row: number[]): number[] => {
    const drops: number[] = [];
    for (let j = 0; j < nx - 1; j += 1) {
      if (row[j + 1] - row[j] < RIDGE_DROP) drops.push(j);
    }
    return drops;
  };

  // Name each wall once, on the top row where it first appears, using the
  // 1-D sweep's attributed cliffs (the same numbers the agent narrates).
  const wallLabels = (() => {
    const top = rows[levels[0]];
    const clusters: number[][] = [];
    for (const j of rowDrops(top)) {
      const x = xAt(j + 1);
      const hit = clusters.find((c) => Math.abs(xAt(c[0] + 1) - x) < 6_000);
      if (hit) hit.push(j);
      else clusters.push([j]);
    }
    return clusters.flatMap((c) => {
      const wallX = xAt(c[0] + 1);
      const cliff = sweepCliffs?.find((cl) => Math.abs(cl.from_x - wallX) < 5_000);
      if (!cliff) return [];
      return [{ j: c[0], text: `${programLabel(cliff.dominant_program)} ends` }];
    });
  })();

  const hoverAt = (level: number) => (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const j = Math.max(0, Math.min(nx - 1, Math.round(((e.clientX - r.left) / r.width) * (nx - 1))));
    setHover({ level, j });
  };

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="stacked-chart"
        aria-label={`Earnings × childcare map: the family's income profile drawn at ${levels.length} daycare costs from ${fmt(heatmap.axis_y.min / 12)} to ${fmt(heatmap.axis_y.max / 12)} a month; red drops mark benefit cliffs; what the family keeps ranges ${fmt(Math.min(...shown))} to ${fmt(vMax)}`}
        onPointerLeave={() => setHover(null)}
      >
        {levels.map((rowIdx, k) => {
          const row = rows[rowIdx];
          const isYou = k === youLevel;
          const monthly = yAt(rowIdx) / 12;
          const line = row.map((v, j) => `${sx(j)},${sy(v, k)}`).join(" L");
          const drops = rowDrops(row);
          return (
            <g key={rowIdx}>
              <path
                d={`M${line} L${sx(nx - 1)},${bandTop(k) + bandH} L${sx(0)},${bandTop(k) + bandH} Z`}
                fill={isYou ? "rgba(37,99,235,0.13)" : "rgba(37,99,235,0.06)"}
              />
              <path
                d={`M${line}`}
                fill="none"
                stroke={C.inkPrimary}
                strokeWidth={isYou ? 2.2 : 1.5}
                opacity={isYou ? 1 : 0.75}
              />
              {/* the cliffs: red drops on the line, same as the main map's language */}
              {drops.map((j) => (
                <line
                  key={`d${j}`}
                  x1={sx(j)}
                  y1={sy(row[j], k)}
                  x2={sx(j + 1)}
                  y2={sy(row[j + 1], k)}
                  stroke={CLIFF_COLOR}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              ))}
              <line
                x1={M.left}
                y1={bandTop(k) + bandH}
                x2={W - M.right}
                y2={bandTop(k) + bandH}
                stroke={C.axis}
                strokeWidth={1}
              />
              <text
                x={M.left - 10}
                y={bandTop(k) + bandH / 2 - 3}
                textAnchor="end"
                fontSize={12.5}
                fontWeight={isYou ? 700 : 400}
                fill={isYou ? "#2563eb" : C.inkSecondary}
              >
                {monthly === 0 ? "no daycare" : `daycare ${fmt(monthly)}/mo`}
              </text>
              {isYou && (
                <text
                  x={M.left - 10}
                  y={bandTop(k) + bandH / 2 + 13}
                  textAnchor="end"
                  fontSize={12.5}
                  fontWeight={700}
                  fill="#2563eb"
                >
                  — you
                </text>
              )}
              {isYou && inX && (
                <circle
                  cx={xOf(earnings)}
                  cy={sy(row[Math.round(((earnings - heatmap.axis_x.min) / (heatmap.axis_x.max - heatmap.axis_x.min || 1)) * (nx - 1))], k)}
                  r={5}
                  fill="#2563eb"
                  stroke="#f5f1e8"
                  strokeWidth={2.5}
                />
              )}
              {/* wall names on the top row only — they hold below by alignment */}
              {k === 0 &&
                wallLabels.map((wl) => {
                  const x = sx(wl.j + 1);
                  const flip = x > W - 230;
                  return (
                    <text
                      key={`wl${wl.j}`}
                      x={flip ? x - 8 : x + 8}
                      y={bandTop(0) + bandH - 7}
                      textAnchor={flip ? "end" : "start"}
                      fontSize={12.5}
                      fontWeight={600}
                      fill="#8f1d1d"
                      stroke="#f5f1e8"
                      strokeWidth={3.5}
                      paintOrder="stroke"
                      pointerEvents="none"
                    >
                      {wl.text}
                    </text>
                  );
                })}
              <rect
                x={M.left}
                y={bandTop(k)}
                width={plotW}
                height={bandH}
                fill="transparent"
                onPointerMove={hoverAt(k)}
              />
            </g>
          );
        })}
        {hover && (
          <line
            x1={sx(hover.j)}
            y1={M.top}
            x2={sx(hover.j)}
            y2={H - M.bottom}
            stroke={C.inkPrimary}
            strokeWidth={1}
            opacity={0.25}
            pointerEvents="none"
          />
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text
            key={`x${t}`}
            x={M.left + t * plotW}
            y={H - M.bottom + 19}
            textAnchor="middle"
            fontSize={12.5}
            fill={C.inkSecondary}
          >
            {fmtK(heatmap.axis_x.min + t * (heatmap.axis_x.max - heatmap.axis_x.min))}
          </text>
        ))}
        <text x={W - M.right} y={H - 6} textAnchor="end" fontSize={12.5} fill={C.inkSecondary}>
          yearly earnings →
        </text>
        <text x={12} y={M.top - 10} fontSize={12.5} fill={C.inkSecondary}>
          your income map, drawn at five daycare costs ·{" "}
          <tspan fill={CLIFF_COLOR} fontWeight={600}>red drops</tspan> = benefit cliffs — watch
          the childcare wall appear as daycare gets pricier
        </text>
      </svg>
      {hover && (
        <div
          className="chart-tooltip"
          style={{ left: `${(Math.min(sx(hover.j), W - 240) / W) * 100}%` }}
        >
          <div className="tt-title">keeps {fmt(rows[levels[hover.level]][hover.j])}</div>
          <div className="tt-row">earnings <b>{fmt(xAt(hover.j))}</b></div>
          <div className="tt-row">daycare <b>{fmt(yAt(levels[hover.level]) / 12)}/mo</b></div>
        </div>
      )}
    </div>
  );
}
