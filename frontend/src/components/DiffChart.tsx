import { useMemo, useRef, useState } from "react";
import { usePeiraStore } from "../state/store";
import type { DiffResult } from "../types";
import { AnnotationPins } from "../viz/AnnotationPins";
import { CHART_CHROME as C } from "../viz/palette";
import { useFittedHeight } from "../viz/useFittedBox";

// Same width system as the sweep map so switching views never rescales the
// ground; height adapts to the box (no letterboxing).
const W = 1240;
const FALLBACK_H = 290;
const M = { top: 34, right: 14, bottom: 30, left: 56 };
const PLOT_W = W - M.left - M.right;

const VARIANT_COLOR = "#1c5cab";

const fmtK = (v: number) =>
  Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;
const fmt = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;

/** Counterfactual overlay: current vs variant net resources, gap shaded. */
export function DiffChart({ diff, label }: { diff: DiffResult; label: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const H = useFittedHeight(svgRef, W, FALLBACK_H, 220, 560);
  const PLOT_H = H - M.top - M.bottom;
  const [idx, setIdx] = useState<number | null>(null);
  const annotations = usePeiraStore((s) => s.annotations);
  const hoverCliffX = usePeiraStore((s) => s.hoverCliffX);
  // Scrubbing here drives the shared cursor, so the money flow and the
  // "what changes" tile follow this chart the way they follow the sweep map.
  const setCurrentIndex = usePeiraStore((s) => s.setCurrentIndex);
  const earnings = usePeiraStore((s) =>
    s.household.adults.reduce((a, ad) => a + ad.employment_income, 0),
  );

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
  // Recomputed every render on purpose: sy changes when the fitted height
  // commits, and a memoized path would keep the stale geometry (the band
  // used to float above both lines because of exactly that).
  const gap = (() => {
    const fwd = x.map((xv, i) => `${sx(xv)},${sy(a[i])}`).join(" L");
    const back = [...x]
      .reverse()
      .map((xv, i) => `${sx(xv)},${sy(b[x.length - 1 - i])}`)
      .join(" L");
    return `M${fwd} L${back} Z`;
  })();

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

  // Answer without hovering: the gap at the household's own earnings, and
  // where the variant starts (or stops) winning.
  const summary = useMemo(() => {
    const youIdx = x.reduce(
      (best, xv, i) => (Math.abs(xv - earnings) < Math.abs(x[best] - earnings) ? i : best),
      0,
    );
    const gapAtYou = b[youIdx] - a[youIdx];
    const crossings: number[] = [];
    for (let i = 1; i < x.length; i += 1) {
      const prev = b[i - 1] - a[i - 1];
      const cur = b[i] - a[i];
      if ((prev < 0 && cur >= 0) || (prev >= 0 && cur < 0)) crossings.push(x[i]);
    }
    return { gapAtYou, crossings };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff, earnings]);

  const onPointerMove = (e: React.PointerEvent) => {
    // Map against the drawn content, not the box — correct even in the
    // clamped edge cases where a letterbox remains.
    const rect = svgRef.current!.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    const contentLeft = rect.left + (rect.width - W * scale) / 2;
    const px = (e.clientX - contentLeft) / scale;
    const i = Math.round(((px - M.left) / PLOT_W) * (x.length - 1));
    const next = i >= 0 && i < x.length ? i : null;
    setIdx(next);
    setCurrentIndex(next);
  };

  return (
    <div className="chart-wrap">
      <div className="diff-summary">
        at your {fmtK(earnings)}: {label}{" "}
        <b className={summary.gapAtYou < 0 ? "neg" : "pos"}>
          {summary.gapAtYou >= 0 ? "+" : ""}
          {fmt(summary.gapAtYou)}
        </b>
        {summary.crossings.length > 0 ? (
          <> · flips at {summary.crossings.map((v) => fmtK(v)).join(", ")}</>
        ) : (
          <> · {summary.gapAtYou >= 0 ? "ahead" : "behind"} across the whole range</>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="stacked-chart"
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          setIdx(null);
          setCurrentIndex(null);
        }}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} y1={sy(v)} x2={W - M.right} y2={sy(v)} stroke={C.grid} />
            <text x={M.left - 8} y={sy(v) + 4} textAnchor="end" fontSize={13} fill={C.inkSecondary}>
              {fmtK(v)}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text
            key={v}
            x={sx(v)}
            y={H - M.bottom + 19}
            textAnchor="middle"
            fontSize={13}
            fill={C.inkSecondary}
          >
            {fmtK(v)}
          </text>
        ))}
        <path d={gap} fill="rgba(28, 92, 171, 0.08)" />
        <path d={line(a)} fill="none" stroke={C.inkPrimary} strokeWidth={1.8} />
        <path d={line(b)} fill="none" stroke={VARIANT_COLOR} strokeWidth={1.8} strokeDasharray="6 4" />
        {/* "you are here", same marker language as the sweep map */}
        {earnings >= xMin && earnings <= xMax && (
          <g pointerEvents="none">
            <line
              x1={sx(earnings)}
              y1={M.top - 4}
              x2={sx(earnings)}
              y2={H - M.bottom}
              stroke="#2563eb"
              strokeWidth={1.6}
              opacity={0.9}
            />
            <text
              x={sx(earnings)}
              y={M.top - 8}
              textAnchor="middle"
              fontSize={13}
              fontWeight={600}
              fill="#2563eb"
              stroke="#f5f1e8"
              strokeWidth={3.5}
              paintOrder="stroke"
            >
              you — {fmtK(earnings)}
            </text>
          </g>
        )}
        {/* the what-if's own cliffs, pinned to the dashed line. Its x array
            can be dollar-shifted (+ partner), so pills sit at the same INDEX
            on today's axis. Positions only — the "what changes" tile carries
            the details. */}
        {(() => {
          const pills: { drop: number; cx: number; topY: number; y: number }[] = [];
          for (const cliff of diff.b.cliffs) {
            const i = diff.b.x.reduce(
              (best, xv, k) =>
                Math.abs(xv - cliff.from_x) < Math.abs(diff.b.x[best] - cliff.from_x)
                  ? k
                  : best,
              0,
            );
            if (i >= x.length) continue;
            const cx = sx(x[i]);
            const topY = sy(b[i]);
            let y = topY - 24;
            for (const p of pills) {
              if (Math.abs(cx - p.cx) < 84) y = Math.min(y, p.y - 25);
            }
            pills.push({ drop: cliff.net_drop, cx, topY, y: Math.max(y, 12) });
          }
          return pills.map(({ drop, cx, topY, y }) => (
            <g key={`${cx}`} pointerEvents="none">
              <line x1={cx} y1={y + 10} x2={cx} y2={topY} stroke="#cc3b3b" strokeWidth={0.9} strokeDasharray="3 3" opacity={0.55} />
              <circle cx={cx} cy={topY} r={3.5} fill="#cc3b3b" />
              <rect x={cx - 34} y={y - 10} width={68} height={20} rx={10} fill="rgba(204,59,59,0.07)" stroke="#cc3b3b" strokeWidth={0.8} strokeDasharray="3 2" />
              <text x={cx} y={y + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#cc3b3b">
                ▼ {fmtK(Math.abs(drop))}
              </text>
            </g>
          ));
        })()}
        {/* a "what changes" cliff row is being hovered: light it up here */}
        {hoverCliffX !== null && hoverCliffX >= xMin && hoverCliffX <= xMax && (
          <line
            x1={sx(hoverCliffX)}
            y1={M.top}
            x2={sx(hoverCliffX)}
            y2={H - M.bottom}
            stroke="#cc3b3b"
            strokeWidth={1.6}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}
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
        <span className="legend-item">
          <span className="swatch" style={{ background: "rgba(28, 92, 171, 0.15)" }} /> the
          gap between the two lives
        </span>
      </div>
    </div>
  );
}
