import { usePeiraStore } from "./state/store";
import { runSweep } from "./probes/runProbes";
import { StackedSweepChart } from "./components/StackedSweepChart";
import "./App.css";

export default function App() {
  const household = usePeiraStore((s) => s.household);
  const sweep = usePeiraStore((s) => s.sweep);
  const probeLog = usePeiraStore((s) => s.probeLog);
  const isProbing = usePeiraStore((s) => s.isProbing);

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
        <ul>
          {household.adults.map((adult, i) => (
            <li key={`a${i}`}>
              Adult {i + 1} · age {adult.age} · $
              {adult.employment_income.toLocaleString()}/yr
            </li>
          ))}
          {household.children.map((child, i) => (
            <li key={`c${i}`}>
              Child {i + 1} · age {child.age} · childcare $
              {child.yearly_childcare_expenses.toLocaleString()}/yr
            </li>
          ))}
          <li className="muted">
            {household.state}
            {household.receiving_childcare_subsidy
              ? " · receiving childcare subsidy"
              : ""}
          </li>
        </ul>
        <button
          className="probe-button"
          disabled={isProbing}
          onClick={() => void runSweep({ min: 0, max: 100_000 }, "human")}
        >
          {isProbing ? "probing…" : "Sweep earnings $0–$100k"}
        </button>
        <p className="muted small">
          Model estimates from policyengine-us — not benefits advice.
        </p>
      </aside>

      <main className="panel canvas-panel">
        {sweep ? (
          <StackedSweepChart sweep={sweep} />
        ) : (
          <div className="chart-empty">
            No sweep yet — ask the agent to probe this household, or run one
            from the household card.
          </div>
        )}
      </main>

      <aside className="panel probe-log-panel">
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
