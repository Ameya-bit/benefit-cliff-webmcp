import { useRef, useState } from "react";
import { usePeiraStore } from "../state/store";
import type { HeatmapResult } from "../types";
import { CHART_CHROME as C, CLIFF_COLOR, programLabel } from "../viz/palette";
import { useFittedHeight } from "../viz/useFittedBox";

const W = 1240;
const FALLBACK_H = 330;
const M = { top: 30, right: 14, bottom: 36, left: 56 };

/** A step down this big (along rising earnings) is drawn as a cliff edge. */
const RIDGE_DROP = -1500;

const fmtK = (v: number) => `$${Math.round(v / 1000)}k`;
const fmt = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;

/** Sequential single-hue ramp (blue), dark -> light with magnitude. The
 * dark end is deliberately soft: the gradient is terrain, the red cliff
 * shadows are the message, and they must stay visible on every cell. */
function rampColor(t: number): string {
  const lo = [72, 112, 168]; // #4870a8
  const hi = [214, 231, 251]; // #d6e7fb
  const c = lo.map((l, i) => Math.round(l + (hi[i] - l) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Opacities for the short "drop shadow" painted to the right of each wall
 * cell — depth for the cliff-edge metaphor, fading over ~3 columns. */
const WALL_FADE = [0.26, 0.13, 0.05];

/** Net resources over earnings × childcare cost. Cliff drops along rising
 * earnings are drawn as red edges, and the household sits on the map as a
 * "you" dot — the safe (bright, unbroken) regions read at a glance. */
export function HeatmapChart({ heatmap }: { heatmap: HeatmapResult }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const H = useFittedHeight(svgRef, W, FALLBACK_H, 220, 560);
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const household = usePeiraStore((s) => s.household);
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

  // Cliff ridges: cell boundaries where one more dollar of earnings drops
  // what the family keeps by more than RIDGE_DROP.
  const ridges: { i: number; j: number }[] = [];
  rows.forEach((row, i) => {
    for (let j = 0; j < nx - 1; j += 1) {
      if (row[j + 1] - row[j] < RIDGE_DROP) ridges.push({ i, j });
    }
  });

  // Name the walls. Ridges cluster into vertical wall systems (a wall can
  // lean as childcare cost changes); each cluster is labeled with the
  // program that ends there, matched by earnings position against the 1-D
  // sweep's attributed cliffs — the same numbers the agent narrates.
  const sweepCliffs = usePeiraStore((s) => s.sweep?.cliffs);
  const wallLabels = (() => {
    if (!ridges.length) return [];
    const clusters: { xs: number[]; topI: number; topJ: number }[] = [];
    for (const r of [...ridges].sort((a, b) => a.j - b.j)) {
      const x = xAt(r.j + 1);
      const hit = clusters.find(
        (c) => Math.abs(c.xs.reduce((s, v) => s + v, 0) / c.xs.length - x) < 6_000,
      );
      if (!hit) {
        clusters.push({ xs: [x], topI: r.i, topJ: r.j });
      } else {
        hit.xs.push(x);
        if (r.i > hit.topI) {
          hit.topI = r.i;
          hit.topJ = r.j;
        }
      }
    }
    return clusters.flatMap((c) => {
      // A wall must span several childcare rows to deserve a name.
      if (c.xs.length < 4) return [];
      const wallX = c.xs.reduce((s, v) => s + v, 0) / c.xs.length;
      const cliff = sweepCliffs?.find((cl) => Math.abs(cl.from_x - wallX) < 5_000);
      if (!cliff) return [];
      return [{ topJ: c.topJ, topI: c.topI, text: `${programLabel(cliff.dominant_program)} ends` }];
    });
  })();

  // The household's own spot on the map.
  const earnings = household.adults.reduce((a, ad) => a + ad.employment_income, 0);
  const childcare = household.children.reduce((a, c) => a + c.yearly_childcare_expenses, 0);
  const inX = earnings >= heatmap.axis_x.min && earnings <= heatmap.axis_x.max;
  const inY = childcare >= heatmap.axis_y.min && childcare <= heatmap.axis_y.max;
  const youX =
    M.left +
    ((earnings - heatmap.axis_x.min) / (heatmap.axis_x.max - heatmap.axis_x.min || 1)) *
      (W - M.left - M.right);
  const youY =
    M.top +
    (1 - (childcare - heatmap.axis_y.min) / (heatmap.axis_y.max - heatmap.axis_y.min || 1)) *
      (H - M.top - M.bottom);

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="stacked-chart"
        aria-label={`Earnings × childcare map: earnings ${fmtK(heatmap.axis_x.min)} to ${fmtK(heatmap.axis_x.max)} by childcare cost ${fmtK(heatmap.axis_y.min)} to ${fmtK(heatmap.axis_y.max)}; net resources ${fmt(vMin)} to ${fmt(vMax)}; red walls mark earnings where one more dollar cuts off a benefit; the widest clear stretch between walls is the safe range`}
        onPointerLeave={() => setHover(null)}
      >
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
        {/* each wall cell casts a short shadow to its right — the drop */}
        {ridges.map(({ i, j }) =>
          WALL_FADE.map(
            (alpha, k) =>
              j + 1 + k < nx && (
                <rect
                  key={`f${i}-${j}-${k}`}
                  x={M.left + (j + 1 + k) * cellW}
                  y={M.top + (ny - 1 - i) * cellH}
                  width={cellW + 0.5}
                  height={cellH + 0.5}
                  fill={`rgba(204,59,59,${alpha})`}
                  pointerEvents="none"
                />
              ),
          ),
        )}
        {/* cliff edges */}
        {ridges.map(({ i, j }) => (
          <line
            key={`r${i}-${j}`}
            x1={M.left + (j + 1) * cellW}
            y1={M.top + (ny - 1 - i) * cellH}
            x2={M.left + (j + 1) * cellW}
            y2={M.top + (ny - i) * cellH}
            stroke={CLIFF_COLOR}
            strokeWidth={2.6}
            opacity={0.9}
            pointerEvents="none"
          />
        ))}
        {/* wall names — the program whose exit builds each wall */}
        {wallLabels.map((wl) => {
          const wallX = M.left + (wl.topJ + 1) * cellW;
          const flip = wallX > W - 220;
          return (
            <text
              key={`wl${wl.topJ}`}
              x={flip ? wallX - 8 : wallX + 8}
              y={M.top + (ny - 1 - wl.topI) * cellH + 17}
              textAnchor={flip ? "end" : "start"}
              fontSize={12.5}
              fontWeight={600}
              fill="#8f1d1d"
              stroke="#ffffff"
              strokeWidth={3.5}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {wl.text}
            </text>
          );
        })}
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
        {/* the household on the map */}
        {inX && inY && (
          <g pointerEvents="none">
            <circle cx={youX} cy={youY} r={6} fill="#2563eb" stroke="#ffffff" strokeWidth={2.5} />
            <text
              x={youX}
              y={youY - 11}
              textAnchor="middle"
              fontSize={12.5}
              fontWeight={600}
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth={3.5}
              paintOrder="stroke"
            >
              you
            </text>
          </g>
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text
            key={`x${t}`}
            x={M.left + t * (W - M.left - M.right)}
            y={H - M.bottom + 19}
            textAnchor="middle"
            fontSize={12.5}
            fill={C.inkSecondary}
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
            fontSize={12.5}
            fill={C.inkSecondary}
          >
            {fmtK(heatmap.axis_y.min + t * (heatmap.axis_y.max - heatmap.axis_y.min))}
          </text>
        ))}
        <text x={W - M.right} y={H - 6} textAnchor="end" fontSize={12.5} fill={C.inkSecondary}>
          yearly earnings →
        </text>
        <text x={12} y={M.top - 10} fontSize={12.5} fill={C.inkSecondary}>
          childcare cost ↑ · lighter = your family keeps more ({fmt(vMin)} → {fmt(vMax)}) ·{" "}
          <tspan fill={CLIFF_COLOR} fontWeight={600}>red walls</tspan> = one more dollar there
          cuts off a benefit · the widest clear stretch is your safe range
        </text>
      </svg>
      {hover && (
        <div className="chart-tooltip" style={{ left: `${(Math.min(M.left + hover.j * cellW, W - 240) / W) * 100}%` }}>
          <div className="tt-title">keeps {fmt(rows[hover.i][hover.j])}</div>
          <div className="tt-row">earnings <b>{fmt(xAt(hover.j))}</b></div>
          <div className="tt-row">childcare cost <b>{fmt(yAt(hover.i))}</b></div>
          {(() => {
            const row = rows[hover.i];
            const wall =
              hover.j < nx - 1 && row[hover.j + 1] - row[hover.j] < RIDGE_DROP;
            if (!wall) return null;
            return (
              <div className="tt-row">
                next {fmt(xAt(hover.j + 1) - xAt(hover.j))} earned here costs{" "}
                <b>{fmt(Math.abs(row[hover.j + 1] - row[hover.j]))}</b>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
