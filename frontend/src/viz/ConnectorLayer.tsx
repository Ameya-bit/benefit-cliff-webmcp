/**
 * A beam that roots the explanation tile to the income it describes: when a
 * cliff is selected, a hairline spine drops from that cliff's spot on the
 * map's baseline to the tile's top edge. (The money-flow tile used to get a
 * cursor beam too — it crossed the legend on every scrub and read as noise,
 * so only the selection beam remains.) Pure overlay — measured from the
 * DOM, pointer-events: none, hidden on stacked (narrow) layouts by CSS.
 */

import { useCallback, useEffect, useState } from "react";
import { usePeiraStore } from "../state/store";
import { CHART_GEOM } from "../components/StackedSweepChart";
import { CLIFF_COLOR } from "./palette";

const CARD_INSET = 24; // spine may leave anywhere along the card's bottom, inset from the corners

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
  const selectedCliff = usePeiraStore((s) => s.selectedCliff);
  const view = usePeiraStore((s) => s.view);

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

    const { W, M } = CHART_GEOM;
    // The viewBox height adapts to the box (useFittedHeight) so the svg
    // normally fills it exactly; read the live height off the element. The
    // min() keeps the math right in the clamped edge cases where a
    // letterbox remains (content centered, pinned to the bottom).
    const H = chart.viewBox.baseVal.height || 320;
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
    // The spine drops from the chart's baseline (the x-axis) to the tile.
    const rootY = contentTop + ((H - M.bottom) / H) * contentH;

    const attach = (sel: string) => {
      const el = root.querySelector<HTMLElement>(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        cardL: r.left - rootRect.left + CARD_INSET,
        cardR: r.right - rootRect.left - CARD_INSET,
        cardY: r.top - rootRect.top,
      };
    };

    const next: Beam[] = [];
    if (selectedCliff) {
      const exp = attach(".explainer");
      if (exp && exp.cardY > rootY) {
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
  }, [container, sweep, selectedCliff]);

  // Re-measure on every state change that moves a root, and when the layout
  // itself breathes (resize, cards growing/shrinking).
  useEffect(() => {
    measure();
    // The chart's fitted viewBox height commits one render after mount and
    // after resizes; re-measure next frame so the beams track it.
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
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
        // Hairline spine only — the wide translucent bodies crossed each
        // other into visual noise (9A.1). The spine leaves the tile at the
        // point of its top edge nearest the root (not the center), so it
        // rises rather than sweeping across the screen; a filled dot marks
        // where it lands on the map's baseline. Control points at 35% / 45%
        // of the rise keep the curve monotone on short spans.
        const d = b.rootY - b.cardY;
        const c1 = b.cardY + 0.35 * d;
        const c2 = b.rootY - 0.45 * d;
        const spineX = Math.max(b.cardL, Math.min(b.rootX, b.cardR));
        const spine = `M ${spineX} ${b.cardY} C ${spineX} ${c1}, ${b.rootX} ${c2}, ${b.rootX} ${b.rootY}`;
        return (
          <g key={b.key}>
            <path d={spine} fill="none" stroke={b.color} strokeWidth={2} opacity={0.5} />
            <circle cx={b.rootX} cy={b.rootY} r={3.5} fill={b.color} opacity={0.8} />
          </g>
        );
      })}
    </svg>
  );
}
