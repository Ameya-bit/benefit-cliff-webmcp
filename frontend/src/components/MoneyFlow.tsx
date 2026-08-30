/**
 * The money flow at ONE income — the vertical slice of the sweep at the
 * cursor. It follows the blue line: while the human scrubs (or pins) the
 * map, this Sankey re-derives live from the sweep curves already in the
 * store (zero backend calls); at rest it sits at the household's own
 * earnings. Each active program is a stream merging into "what your
 * family keeps"; taxes branch off; inactive programs sit below as quiet
 * $0 rows. A live trace pins the binding rule to its stream as a glowing
 * gate chip. Clicking a stream focuses the explainer panel.
 *
 * The viewBox IS the measured CSS box (scale exactly 1, viewBox units are
 * pixels), so type renders at page size and the layout adapts to the card
 * instead of letterboxing inside it. The box only changes on resize, so
 * the figure stays still while the cursor drags it through incomes.
 */

import { useMemo, useRef, useState } from "react";
import { interpolate } from "../probes/analysis";
import { usePeiraStore } from "../state/store";
import type { SweepResult } from "../types";
import { CHART_CHROME as C, PROGRAM_LAYERS } from "../viz/palette";
import { useMeasuredBox } from "../viz/useFittedBox";

const NODE_W = 10;
const TOP = 12;
const GAP = 8;
/** Vertical pitch of the inactive $0 rows. */
const ROW_PITCH = 17;
/** Streams thinner than this many dollars list as inactive rows instead. */
const ACTIVE_MIN = 100;

const fmt = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;

interface Stream {
  slug: string;
  label: string;
  color: string;
  value: number;
  h: number;
  yL: number;
  hR: number;
  yR: number;
}

/** compact: tile mode — only live streams, no $0 rows or side notes; the
 * expanded detail sheet shows everything. sweep overrides the store's sweep
 * so a what-if view can show the changed household's flow. */
export function MoneyFlow({
  compact = false,
  sweep: sweepOverride,
  restIndex = null,
}: {
  compact?: boolean;
  sweep?: SweepResult;
  /** Index to rest at when the cursor is off the map — what-if sweeps can be
   * dollar-shifted, so position is anchored by index, not by earnings. */
  restIndex?: number | null;
}) {
  const storeSweep = usePeiraStore((s) => s.sweep);
  const sweep = sweepOverride ?? storeSweep;
  const household = usePeiraStore((s) => s.household);
  const currentIndex = usePeiraStore((s) => s.currentIndex);
  const trace = usePeiraStore((s) => s.trace);
  const focusProgram = usePeiraStore((s) => s.focusProgram);
  const setFocusProgram = usePeiraStore((s) => s.setFocusProgram);

  const earnings = household.adults.reduce((a, ad) => a + ad.employment_income, 0);
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const { w: W, h: H } = useMeasuredBox(svgRef, { w: 960, h: 440 });

  // Horizontal anchors, derived from the real width: source labels end at
  // X_LABEL, ribbons run X_NODE → X_KEEP, the destination text sits right
  // of X_KEEP. The floor fits the longest label ("Childcare help (CCAP) ·
  // $NN,NNN") without clipping the tile's left edge.
  const X_LABEL = Math.max(195, Math.min(235, 0.36 * W));
  const X_NODE = X_LABEL + 12;
  const X_KEEP = Math.max(X_NODE + 120, W - 170);
  const MID = (X_NODE + X_KEEP) / 2;

  const ribbon = (y1: number, h1: number, y2: number, h2: number) =>
    `M ${X_NODE + NODE_W} ${y1} C ${MID} ${y1}, ${MID} ${y2}, ${X_KEEP} ${y2}` +
    ` L ${X_KEEP} ${y2 + h2} C ${MID} ${y2 + h2}, ${MID} ${y1 + h1}, ${X_NODE + NODE_W} ${y1 + h1} Z`;

  const model = useMemo(() => {
    if (!sweep || sweep.x.length < 2) return null;
    const idx = currentIndex ?? restIndex;
    const cursorX = idx !== null && idx < sweep.x.length ? sweep.x[idx] : null;
    const at = Math.max(sweep.x[0], Math.min(cursorX ?? earnings, sweep.x[sweep.x.length - 1]));
    const programValues = PROGRAM_LAYERS.map((layer) => ({
      ...layer,
      value: interpolate(sweep.x, sweep.programs[layer.slug] ?? [0, 0], at),
    }));
    const programSum = programValues.reduce((a, p) => a + p.value, 0);
    const net = interpolate(sweep.x, sweep.net_income, at);
    const base = net - programSum; // earnings after taxes
    const taxes = Math.max(0, at - base);

    const active: Stream[] = [];
    const inactive: { slug: string; label: string }[] = [];
    const activePrograms = programValues.filter((p) => p.value > ACTIVE_MIN);
    if (!compact) {
      for (const p of programValues) {
        if (p.value <= ACTIVE_MIN) inactive.push({ slug: p.slug, label: p.label });
      }
    }

    // Vertical budget: reserve room for the inactive rows and the tax
    // outflow, and give the rest to the ribbons.
    const nActive = 1 + activePrograms.length;
    const taxReserve = taxes > ACTIVE_MIN ? 34 : 8;
    const plotH = Math.max(
      60,
      H - TOP - inactive.length * ROW_PITCH - taxReserve - nActive * GAP - 24,
    );
    const totalIn = at + activePrograms.reduce((a, p) => a + p.value, 0);
    const scale = totalIn > 0 ? plotH / totalIn : 0;

    let y = TOP;
    const push = (slug: string, label: string, color: string, value: number) => {
      const h = Math.max(3, value * scale);
      active.push({ slug, label, color, value, h, yL: y, hR: 0, yR: 0 });
      y += h + GAP;
    };
    push("job", "The job", C.inkPrimary, at);
    for (const p of activePrograms) push(p.slug, p.label, p.color, p.value);

    // right-side stack: the job arrives net of taxes
    let yr = TOP + 8;
    for (const s of active) {
      s.hR = Math.max(2.5, (s.slug === "job" ? Math.max(0, s.value - taxes) : s.value) * scale);
      s.yR = yr;
      yr += s.hR;
    }

    return {
      at,
      net,
      taxes,
      scale,
      active,
      inactive,
      inactiveY: y + 4,
      keepsTop: TOP + 8,
      keepsBot: yr,
    };
  }, [sweep, earnings, currentIndex, restIndex, H, compact]);

  if (!model) return null;
  const { at, net, taxes, scale, active, inactive, keepsTop, keepsBot } = model;

  const job = active[0];
  const taxH = Math.max(2, taxes * scale);
  const inactiveBot = model.inactiveY + inactive.length * ROW_PITCH;
  const taxY = Math.max(keepsBot, inactiveBot) + 10;
  const taxOutH = Math.max(3, Math.min(taxH * 0.8, H - taxY - 6));

  const tracedSlug = trace?.dominant_program ?? null;
  const gateRule = trace?.binding_rules[0] ?? null;
  const gateStream = tracedSlug ? active.find((s) => s.slug === tracedSlug) : null;

  const snapActive = active.some((s) => s.slug === "snap");
  const tanfInactive = inactive.some((p) => p.slug === "tanf");
  const snapStream = active.find((s) => s.slug === "snap");

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="money-flow"
      aria-label={`Money flow at ${fmt(at)} of yearly earnings`}
    >
      {/* ribbons */}
      {active.map((s) => {
        const useH = s.slug === "job" ? Math.max(2.5, Math.max(0, s.value - taxes) * scale) : s.h;
        const clickable = s.slug !== "job";
        const dimmed = focusProgram !== null && focusProgram !== s.slug && s.slug !== "job";
        const hovered = clickable && hoverSlug === s.slug;
        return (
          <path
            key={s.slug}
            d={ribbon(s.yL, useH, s.yR, s.hR)}
            fill={s.color}
            opacity={hovered ? 0.72 : dimmed ? 0.15 : 0.4}
            style={{ cursor: clickable ? "pointer" : "default", transition: "opacity 180ms ease" }}
            onMouseEnter={clickable ? () => setHoverSlug(s.slug) : undefined}
            onMouseLeave={clickable ? () => setHoverSlug(null) : undefined}
            onClick={
              clickable
                ? () => setFocusProgram(focusProgram === s.slug ? null : s.slug)
                : undefined
            }
          >
            <title>{`${s.label}: ${fmt(s.value)}/yr — click to read about it`}</title>
          </path>
        );
      })}

      {/* taxes: branch from the job ribbon's lower band to a small outflow */}
      {taxes > ACTIVE_MIN && (
        <>
          <path
            d={ribbon(job.yL + job.h - taxH, taxH, taxY, taxOutH)}
            fill="#b3b3b3"
            opacity={0.35}
          />
          <rect x={X_KEEP} y={taxY} width={NODE_W} height={taxOutH} rx={2.5} fill="#b3b3b3" />
          <text
            x={X_KEEP + 20}
            y={taxY + taxOutH / 2 + 4}
            fontSize={11.5}
            fill={C.inkMuted}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            Taxes · −{fmt(taxes)}
          </text>
        </>
      )}

      {/* source bars + labels */}
      {active.map((s) => {
        const clickable = s.slug !== "job";
        const emphasized = focusProgram === s.slug || hoverSlug === s.slug;
        return (
          <g
            key={`n-${s.slug}`}
            style={{ cursor: clickable ? "pointer" : "default" }}
            onMouseEnter={clickable ? () => setHoverSlug(s.slug) : undefined}
            onMouseLeave={clickable ? () => setHoverSlug(null) : undefined}
            onClick={
              clickable
                ? () => setFocusProgram(focusProgram === s.slug ? null : s.slug)
                : undefined
            }
          >
            <rect x={X_NODE} y={s.yL} width={NODE_W} height={s.h} rx={3} fill={s.color} />
            <text
              x={X_LABEL}
              y={s.yL + Math.min(s.h / 2, 24) + 4}
              textAnchor="end"
              fontSize={12}
              fill={C.inkPrimary}
              fontWeight={emphasized ? 600 : 400}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {s.label} · {fmt(s.value)}
            </text>
          </g>
        );
      })}

      {/* inactive programs: quiet $0 rows */}
      {inactive.map((p, i) => {
        const iy = model.inactiveY + i * ROW_PITCH;
        return (
          <g
            key={`i-${p.slug}`}
            className="flow-inactive"
            style={{ cursor: "pointer" }}
            onClick={() => setFocusProgram(focusProgram === p.slug ? null : p.slug)}
          >
            <rect
              x={X_NODE}
              y={iy}
              width={NODE_W}
              height={7}
              rx={2.5}
              fill="none"
              stroke={C.axis}
              strokeDasharray="3 3"
            />
            <text x={X_LABEL} y={iy + 7} textAnchor="end" fontSize={11} fill={C.inkMuted}>
              {p.label} · $0
            </text>
            <title>{`${p.label}: nothing at this income — click to read about it`}</title>
          </g>
        );
      })}

      {/* TANF's rules still unlock SNAP's easier income test (BBCE) */}
      {tanfInactive && snapActive && snapStream && (
        <>
          {(() => {
            const tanfIdx = inactive.findIndex((p) => p.slug === "tanf");
            const ty = model.inactiveY + tanfIdx * ROW_PITCH + 3;
            return (
              <>
                <path
                  d={`M ${X_NODE + NODE_W + 4} ${ty} C ${X_NODE + 84} ${ty - 4}, ${X_NODE + 56} ${snapStream.yL + 16}, ${X_NODE + 26} ${snapStream.yL + 6}`}
                  fill="none"
                  stroke={C.axis}
                  strokeWidth={1.1}
                  strokeDasharray="4 3"
                />
                <text x={X_NODE + 92} y={ty + 2} fontSize={10} fill={C.inkMuted}>
                  its rules still unlock the food-aid test
                </text>
              </>
            );
          })()}
        </>
      )}

      {/* gate chip: the traced binding rule rides its stream */}
      {gateStream && gateRule && (
        <g>
          <rect
            x={X_NODE + 32}
            y={gateStream.yL + gateStream.h / 2 - 9}
            width={Math.min(gateRule.rule.length, 46) * 5.4 + 18}
            height={18}
            rx={9}
            fill="#ffffff"
            stroke={gateStream.color}
            strokeWidth={1.4}
            style={{ filter: `drop-shadow(0 0 5px ${gateStream.color}88)` }}
          />
          <text
            x={X_NODE + 41}
            y={gateStream.yL + gateStream.h / 2 + 4}
            fontSize={10}
            fontWeight={600}
            fill={gateStream.color}
          >
            rule: {gateRule.rule.length > 46 ? `${gateRule.rule.slice(0, 45)}…` : gateRule.rule}
          </text>
        </g>
      )}

      {/* destination: what your family keeps */}
      <rect
        x={X_KEEP}
        y={keepsTop}
        width={12}
        height={Math.max(4, keepsBot - keepsTop)}
        rx={4}
        fill={C.inkPrimary}
      />
      {/* the amount itself is the HTML hero number in the card header;
          two stacked lines so nothing clips at the card's right edge */}
      <text x={X_KEEP + 22} y={(keepsTop + keepsBot) / 2 - 18} fontSize={11.5} fill={C.inkSecondary}>
        <tspan x={X_KEEP + 22}>What your</tspan>
        <tspan x={X_KEEP + 22} dy={14}>family keeps</tspan>
      </text>
      <text
        x={X_KEEP + 22}
        y={(keepsTop + keepsBot) / 2 + 16}
        fontSize={13}
        fontWeight={600}
        fill={C.inkPrimary}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {fmt(net)}
      </text>
    </svg>
  );
}
