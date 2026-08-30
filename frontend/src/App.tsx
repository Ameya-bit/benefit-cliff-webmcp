import { useEffect, useRef, useState } from "react";
import { interpolate } from "./probes/analysis";
import { usePeiraStore } from "./state/store";
import type { SweepResult } from "./types";
import { ConnectorLayer } from "./viz/ConnectorLayer";
import { StackedSweepChart } from "./components/StackedSweepChart";
import { DiffChart } from "./components/DiffChart";
import { HeatmapChart } from "./components/HeatmapChart";
import { ActivityTicker } from "./components/ActivityTicker";
import { ExplainerPanel } from "./components/ExplainerPanel";
import { HouseholdBar } from "./components/HouseholdBar";
import { MapControls } from "./components/MapControls";
import { MoneyFlow } from "./components/MoneyFlow";
import { ProbeProgress } from "./components/ProbeProgress";
import { Rail } from "./components/Rail";
import { ScenarioLibrary } from "./components/ScenarioLibrary";
import { StatusBanners } from "./components/StatusBanners";
import { programLabel } from "./viz/palette";
import "./App.css";

const fmt = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;

function CanvasArea() {
  const sweep = usePeiraStore((s) => s.sweep);
  const view = usePeiraStore((s) => s.view);
  const restoreBaseline = usePeiraStore((s) => s.restoreBaseline);
  const setView = usePeiraStore((s) => s.setView);

  // Overlay views always offer a way home (the income map).
  const backToMap = sweep ? (
    <button className="btn" onClick={() => setView({ mode: "sweep" })}>
      back to the map
    </button>
  ) : null;
  if (view.mode === "heatmap")
    return (
      <>
        <div className="mode-banner view-banner">
          <span>
            <b>earnings × childcare map</b> — where your family comes out ahead
          </span>
          {backToMap}
        </div>
        <HeatmapChart heatmap={view.heatmap} />
      </>
    );
  if (view.mode === "diff")
    return (
      <>
        <div className="mode-banner view-banner">
          <span>
            <b>what if: {view.label}</b> — dashed line, against today's household
          </span>
          {backToMap}
        </div>
        <DiffChart diff={view.diff} label={view.label} />
      </>
    );
  if (!sweep) return null;
  return (
    <>
      {view.mode === "reform" && (
        <div className="mode-banner reform-banner">
          <span>
            <b>changed rules</b> — {view.label} · dashed line is current law
          </span>
          <button className="btn" onClick={restoreBaseline}>
            back to current law
          </button>
        </div>
      )}
      {view.mode === "ablate" && (
        <div className="mode-banner ablate-banner">
          <span>
            <b>without {programLabel(view.program)}</b>
            {Object.keys(view.interactions).length > 0
              ? ` — also moved: ${Object.entries(view.interactions)
                  .map(([slug, v]) => `${programLabel(slug)} (${fmt(v)})`)
                  .join(", ")}`
              : " — nothing else depends on it"}
          </span>
          <button className="btn" onClick={restoreBaseline}>
            restore
          </button>
        </div>
      )}
      <StackedSweepChart sweep={sweep} />
    </>
  );
}

/** Header line the flow shares between its tile and its detail sheet.
 * flowSweep is the sweep the flow is actually drawing (the changed
 * household's curves during a what-if); restIndex anchors the resting
 * position by INDEX because a what-if's x array can be dollar-shifted
 * (e.g. + partner adds their income to every household total). */
function FlowHead({
  flowSweep,
  restIndex,
}: {
  flowSweep: SweepResult;
  restIndex: number | null;
}) {
  const flowLabel = usePeiraStore((s) => {
    if (s.view.mode === "ablate") return `without ${programLabel(s.view.program)}`;
    if (s.view.mode === "reform") return "under the changed rules";
    if (s.view.mode === "diff") return `with ${s.view.label}`;
    return null;
  });
  const earnings = usePeiraStore((s) =>
    s.household.adults.reduce((a, ad) => a + ad.employment_income, 0),
  );
  // The money flow is the slice of the map at the cursor; this header names
  // the income it is currently showing. The label always speaks in the
  // map's own axis (today's household), even when the curves are a what-if's.
  const cursorX = usePeiraStore((s) =>
    s.currentIndex !== null && s.sweep && s.currentIndex < s.sweep.x.length
      ? s.sweep.x[s.currentIndex]
      : null,
  );
  // The one number that owns the tile: what the family keeps at the income
  // the flow is showing.
  const netAtCursor = usePeiraStore((s) => {
    if (flowSweep.x.length < 2) return null;
    const xs = flowSweep.x;
    const idx = s.currentIndex ?? restIndex;
    const at = Math.max(
      xs[0],
      Math.min(idx !== null && idx < xs.length ? xs[idx] : earnings, xs[xs.length - 1]),
    );
    return interpolate(xs, flowSweep.net_income, at);
  });

  const onCursor = cursorX !== null && Math.round(cursorX) !== Math.round(earnings);
  return (
    <>
      <div className="sec-head">
        <span className="eyebrow">Where the money comes from</span>
        <span className="at">
          {onCursor ? (
            <>
              at the line on the map — <b className="cursor-inc">{fmt(cursorX)}</b>
            </>
          ) : (
            <>
              at this household’s earnings — <b>{fmt(earnings)}</b>
            </>
          )}
          {flowLabel && <em> · {flowLabel}</em>}
        </span>
      </div>
      {netAtCursor !== null && (
        <div className="hero-keep">
          <span className={`hero-num${onCursor ? " cursor-inc" : ""}`}>
            {fmt(netAtCursor)}
          </span>
          <span className="hero-sub">what your family keeps</span>
        </div>
      )}
    </>
  );
}

/** The expanded money flow — the Wallet detail sheet over the page. */
function FlowSheet({
  flowSweep,
  restIndex,
  onClose,
}: {
  flowSweep: SweepResult;
  restIndex: number | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="flow-modal-backdrop" onClick={onClose} />
      <div className="flow-modal" role="dialog" aria-modal="true" aria-label="Where the money comes from">
        <button
          ref={closeRef}
          className="close-btn"
          aria-label="close"
          onClick={onClose}
        >
          ✕
        </button>
        <FlowHead flowSweep={flowSweep} restIndex={restIndex} />
        <div className="svg-wrap">
          <MoneyFlow sweep={flowSweep} restIndex={restIndex} />
        </div>
      </div>
    </>
  );
}

export default function App() {
  const mainRef = useRef<HTMLDivElement>(null);
  const sweep = usePeiraStore((s) => s.sweep);
  const view = usePeiraStore((s) => s.view);
  const [flowOpen, setFlowOpen] = useState(false);

  // During a what-if the flow shows the CHANGED household's money, not
  // today's — the two-line map already carries the comparison.
  const flowSweep = view.mode === "diff" ? view.diff.b : sweep;
  // A what-if's x array can be dollar-shifted (+ partner adds their income
  // to every total), so the resting anchor is the INDEX of today's earnings
  // on today's map, not a dollar value.
  const earnings = usePeiraStore((s) =>
    s.household.adults.reduce((a, ad) => a + ad.employment_income, 0),
  );
  const restIndex =
    view.mode === "diff" && sweep && sweep.x.length > 1
      ? sweep.x.reduce(
          (best, xv, i) =>
            Math.abs(xv - earnings) < Math.abs(sweep.x[best] - earnings) ? i : best,
          0,
        )
      : null;

  return (
    <div className="app">
      <header>
        <div className="mark">
          Peira
          <small>
            see what a raise <span className="serif-it">really</span> does
          </small>
        </div>
        <HouseholdBar />
      </header>

      <div className="main" ref={mainRef}>
        {!sweep || !flowSweep ? (
          <div className="empty-center">
            <StatusBanners />
            <ScenarioLibrary />
          </div>
        ) : (
          <>
            <StatusBanners />
            <section className="map-card map-zone">
              <div className="map-head">
                <span className="eyebrow">
                  {view.mode === "heatmap"
                    ? "Earnings × childcare map"
                    : "What you keep at every income"}
                </span>
                <MapControls />
              </div>
              <div className="stage">
                <CanvasArea />
                <ProbeProgress />
              </div>
            </section>

            <section className="tile-row">
              <div className="tile flow-tile">
                <button
                  className="expand-btn"
                  title="Expand the money flow — every program, including the $0 ones"
                  aria-label="expand the money flow"
                  onClick={() => setFlowOpen(true)}
                >
                  ⤢
                </button>
                <FlowHead flowSweep={flowSweep} restIndex={restIndex} />
                <div className="svg-wrap">
                  <MoneyFlow compact sweep={flowSweep} restIndex={restIndex} />
                </div>
              </div>
              <ExplainerPanel />
              <div className="tile explored-tile">
                <div className="sec-head">
                  <span className="eyebrow">Explored so far</span>
                </div>
                <ActivityTicker />
                <Rail />
              </div>
            </section>

            <p className="provenance">
              Computed with policyengine-us · Colorado rules · 2026 — model
              estimates, not benefits advice
            </p>

            <ConnectorLayer container={mainRef} />
          </>
        )}
      </div>

      {flowOpen && flowSweep && (
        <FlowSheet
          flowSweep={flowSweep}
          restIndex={restIndex}
          onClose={() => setFlowOpen(false)}
        />
      )}
    </div>
  );
}
