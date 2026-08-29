/**
 * Beams that root the detail cards to the incomes they describe. The map is
 * the ground of the page; the money-flow card grows out of the blue cursor
 * line, and the explanation card grows out of the selected cliff, each as a
 * soft beam that widens as it rises. Cards stay put; only the roots move.
 * Pure overlay — measured from the DOM, pointer-events: none, hidden on
 * stacked (narrow) layouts by CSS.
 */

import { useCallback, useEffect, useState } from "react";
import { usePeiraStore } from "../state/store";
import { CHART_GEOM } from "../components/StackedSweepChart";
import { CLIFF_COLOR } from "./palette";

const YOU_COLOR = "#2563eb";
const ROOT_W = 22; // beam width where it meets the map
const CARD_SEG = 120; // max width of the attachment segment under a card

interface Beam {
  key: string;
  rootX: number;
  rootY: number;
  cardL: number;
  cardR: number;
  cardY: number;
  color: string;
}

export function ConnectorLayer({
  container,
}: {
  container: React.RefObject<HTMLDivElement | null>;
}) {
  const sweep = usePeiraStore((s) => s.sweep);
  const currentIndex = usePeiraStore((s) => s.currentIndex);
  const selectedCliff = usePeiraStore((s) => s.selectedCliff);
  const view = usePeiraStore((s) => s.view);
  const earnings = usePeiraStore((s) =>
    s.household.adults.reduce((a, ad) => a + ad.employment_income, 0),
  );

  const [beams, setBeams] = useState<Beam[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const root = container.current;
    // Only the sweep map anchors beams — diff/heatmap views share the chart
    // styling class but not this one.
    const chart = root?.querySelector<SVGSVGElement>("svg.sweep-map");
    if (!root || !sweep || sweep.x.length < 2 || !chart) {
      setBeams([]);
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const chartRect = chart.getBoundingClientRect();
    setSize({ w: root.clientWidth, h: root.clientHeight });

    const { W, H, M } = CHART_GEOM;
    // The svg letterboxes inside its flexed box (preserveAspectRatio
    // xMidYMax): content is centered horizontally, pinned to the bottom.
    const scale = Math.min(chartRect.width / W, chartRect.height / H);
    const contentW = W * scale;
    const contentH = H * scale;
    const contentLeft = chartRect.left - rootRect.left + (chartRect.width - contentW) / 2;
    const contentTop = chartRect.bottom - rootRect.top - contentH;

    const xMin = sweep.x[0];
    const xMax = sweep.x[sweep.x.length - 1];
    const plotW = W - M.left - M.right;
    const xToPx = (v: number) =>
      contentLeft + ((M.left + ((v - xMin) / (xMax - xMin)) * plotW) / W) * contentW;
    const rootY = contentTop + (M.top / H) * contentH;

    const attach = (sel: string) => {
      const el = root.querySelector<HTMLElement>(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const w = Math.min(CARD_SEG, r.width * 0.6);
      const cx = r.left - rootRect.left + r.width / 2;
      return { cardL: cx - w / 2, cardR: cx + w / 2, cardY: r.bottom - rootRect.top };
    };

    const next: Beam[] = [];
    const cursorX =
      currentIndex !== null && currentIndex < sweep.x.length
        ? sweep.x[currentIndex]
        : Math.max(xMin, Math.min(earnings, xMax));
    const flow = attach(".flow-card");
    if (flow && flow.cardY < rootY) {
      next.push({ key: "flow", rootX: xToPx(cursorX), rootY, color: YOU_COLOR, ...flow });
    }
    if (selectedCliff) {
      const exp = attach(".explainer");
      if (exp && exp.cardY < rootY) {
        next.push({
          key: "cliff",
          rootX: xToPx(selectedCliff.from_x),
          rootY,
          color: CLIFF_COLOR,
          ...exp,
        });
      }
    }
    setBeams(next);
  }, [container, sweep, currentIndex, selectedCliff, earnings]);

  // Re-measure on every state change that moves a root, and when the layout
  // itself breathes (resize, cards growing/shrinking).
  useEffect(() => {
    measure();
  }, [measure, view]);
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [container, measure]);

  if (beams.length === 0) return null;
  return (
    <svg className="connector-layer" width={size.w} height={size.h} aria-hidden="true">
      {beams.map((b) => {
        // Monotone funnel: control points at 35% / 45% of the drop, so the
        // taper never bulges past its endpoints (an S-curve at mid-height
        // balloons when the span is short).
        const d = b.rootY - b.cardY;
        const c1 = b.cardY + 0.35 * d;
        const c2 = b.rootY - 0.45 * d;
        const rL = b.rootX - ROOT_W / 2;
        const rR = b.rootX + ROOT_W / 2;
        const body =
          `M ${b.cardL} ${b.cardY}` +
          ` C ${b.cardL} ${c1}, ${rL} ${c2}, ${rL} ${b.rootY}` +
          ` L ${rR} ${b.rootY}` +
          ` C ${rR} ${c2}, ${b.cardR} ${c1}, ${b.cardR} ${b.cardY} Z`;
        const spineX = (b.cardL + b.cardR) / 2;
        const spine = `M ${spineX} ${b.cardY} C ${spineX} ${c1}, ${b.rootX} ${c2}, ${b.rootX} ${b.rootY}`;
        return (
          <g key={b.key}>
            {/* body alpha matches the card background so beam and card read
                as one continuous shape */}
            <path d={body} fill={b.color} opacity={0.06} />
            <path d={spine} fill="none" stroke={b.color} strokeWidth={1.3} opacity={0.35} />
          </g>
        );
      })}
    </svg>
  );
}
