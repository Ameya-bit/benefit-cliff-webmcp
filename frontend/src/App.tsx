import { usePeiraStore } from "./state/store";
import { StackedSweepChart } from "./components/StackedSweepChart";
import { DiffChart } from "./components/DiffChart";
import { HeatmapChart } from "./components/HeatmapChart";
import { HouseholdCard } from "./components/HouseholdCard";
import { ProbeControls } from "./components/ProbeControls";
import { PROGRAM_LAYERS } from "./viz/palette";
import "./App.css";

const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

function CanvasArea() {
  const sweep = usePeiraStore((s) => s.sweep);
  const view = usePeiraStore((s) => s.view);
  const restoreBaseline = usePeiraStore((s) => s.restoreBaseline);

  if (view.mode === "heatmap") return <HeatmapChart heatmap={view.heatmap} />;
  if (view.mode === "diff") return <DiffChart diff={view.diff} label={view.label} />;
  if (!sweep) {
    return (
      <div className="chart-empty">
        No sweep yet — ask the agent to probe this household, or run one from
        the household card.
      </div>
    );
  }
  return (
    <>
      {view.mode === "reform" && (
        <div className="reform-banner">
          <span>
            <b>reformed mechanism</b> — {view.label}
          </span>
          <button className="probe-button inline" onClick={restoreBaseline}>
            restore current law
          </button>
        </div>
      )}
      {view.mode === "ablate" && (
        <div className="ablate-banner">
          <span>
            <b>{view.program}</b> ablated —{" "}
            {Object.keys(view.interactions).length > 0
              ? `also moved: ${Object.entries(view.interactions)
                  .map(([slug, v]) => `${slug} (${fmt(v)})`)
                  .join(", ")}`
              : "no other program depends on it"}
          </span>
          <button className="probe-button inline" onClick={restoreBaseline}>
            restore baseline
          </button>
        </div>
      )}
      <StackedSweepChart sweep={sweep} />
    </>
  );
}

function MechanismInspector() {
  const trace = usePeiraStore((s) => s.trace);
  const setTrace = usePeiraStore((s) => s.setTrace);
  if (!trace) return null;
  const losses = Object.entries(trace.program_deltas)
    .filter(([, v]) => Math.abs(v) > 1)
    .sort(([, a], [, b]) => a - b);
  return (
    <div className="inspector">
      <h2>Mechanism inspector</h2>
      <div className="tt-title">
        crossing {fmt(trace.at)} → {fmt(trace.at + trace.step)}
      </div>
      <div className="tt-row">
        net resources <b className={trace.net_income_delta < 0 ? "neg" : "pos"}>{fmt(trace.net_income_delta)}</b>
      </div>
      {losses.map(([slug, v]) => {
        const layer = PROGRAM_LAYERS.find((l) => l.slug === slug);
        return (
          <div key={slug} className={`tt-row ${slug === trace.dominant_program ? "dominant" : ""}`}>
            <span className="swatch" style={{ background: layer?.color }} />
            {layer?.label ?? slug}
            <b className={v < 0 ? "neg" : "pos"}>{fmt(v)}</b>
          </div>
        );
      })}
      {trace.binding_rules.map((rule) => (
        <div key={rule.variable + (rule.person ?? "")} className="binding-rule">
          <div className="rule-name">{rule.rule}</div>
          <div className="muted small">
            {rule.person ? `${rule.person.replace("_", " ")}: ` : ""}
            {String(rule.before)} → {String(rule.after)}
            {rule.editable_parameter && (
              <>
                {" · dial: "}
                <code>{rule.editable_parameter.id}</code> ={" "}
                {String(rule.editable_parameter.current_value)}
              </>
            )}
          </div>
        </div>
      ))}
      <button className="probe-button inline" onClick={() => setTrace(null)}>
        clear highlight
      </button>
    </div>
  );
}

export default function App() {
  const probeLog = usePeiraStore((s) => s.probeLog);

  return (
    <div className="bench">
      <header className="bench-header">
        <h1>Peira</h1>
        <p className="tagline">
          probe the benefits mechanism — πεῖρα, the root of <em>empirical</em>
        </p>
      </header>

      <aside className="panel household-panel">
        <h2>Household</h2>
        <HouseholdCard />
        <ProbeControls />
        <p className="muted small">
          Model estimates from policyengine-us — not benefits advice.
        </p>
      </aside>

      <main className="panel canvas-panel">
        <CanvasArea />
      </main>

      <aside className="panel probe-log-panel">
        <MechanismInspector />
        <h2>Probe log</h2>
        {probeLog.length === 0 && <p className="muted">No probes yet.</p>}
        <ul>
          {probeLog.map((entry) => (
            <li key={entry.id}>
              <span className={`source source-${entry.source}`}>
                {entry.source}
              </span>
              <div>
                <code>{entry.tool}</code>
                <div className="muted small">{entry.summary}</div>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
