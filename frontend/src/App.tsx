import { useRef } from "react";
import { usePeiraStore } from "./state/store";
import { ConnectorLayer } from "./viz/ConnectorLayer";
import { StackedSweepChart } from "./components/StackedSweepChart";
import { DiffChart } from "./components/DiffChart";
import { HeatmapChart } from "./components/HeatmapChart";
import { HouseholdBar } from "./components/HouseholdBar";
import { MoneyFlow } from "./components/MoneyFlow";
import { ScenarioLibrary } from "./components/ScenarioLibrary";
import { StatusBanners } from "./components/StatusBanners";
import { programLabel } from "./viz/palette";
import "./App.css";

const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

function CanvasArea() {
  const sweep = usePeiraStore((s) => s.sweep);
  const view = usePeiraStore((s) => s.view);
  const restoreBaseline = usePeiraStore((s) => s.restoreBaseline);

  if (view.mode === "heatmap") return <HeatmapChart heatmap={view.heatmap} />;
  if (view.mode === "diff") return <DiffChart diff={view.diff} label={view.label} />;
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

export default function App() {
  const mainRef = useRef<HTMLDivElement>(null);
  const sweep = usePeiraStore((s) => s.sweep);
  const flowLabel = usePeiraStore((s) => {
    if (s.view.mode === "ablate") return `without ${programLabel(s.view.program)}`;
    if (s.view.mode === "reform") return "under the changed rules";
    return null;
  });
  const earnings = usePeiraStore((s) =>
    s.household.adults.reduce((a, ad) => a + ad.employment_income, 0),
  );
  // The money flow is the slice of the map at the cursor; its header names
  // the income it is currently showing.
  const cursorX = usePeiraStore((s) =>
    s.currentIndex !== null && s.sweep && s.currentIndex < s.sweep.x.length
      ? s.sweep.x[s.currentIndex]
      : null,
  );

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
        <div className="disclaimer">Model estimates — not benefits advice</div>
      </header>

      <div className="main" ref={mainRef}>
        {!sweep ? (
          <div className="empty-center">
            <StatusBanners />
            <ScenarioLibrary />
          </div>
        ) : (
          <>
            <StatusBanners />
            <section className="detail-zone">
              <div className="flow-card">
                <div className="sec-head">
                  <span className="eyebrow">How the money flows</span>
                  <span className="at">
                    {cursorX !== null && Math.round(cursorX) !== Math.round(earnings) ? (
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
                  <span className="flow-hint">
                    slide or click on the map below to look at any income
                  </span>
                </div>
                <div className="svg-wrap">
                  <MoneyFlow />
                </div>
              </div>
            </section>

            <section className="map-zone">
              <div className="stage">
                <CanvasArea />
              </div>
            </section>

            <ConnectorLayer container={mainRef} />
          </>
        )}
      </div>
    </div>
  );
}
