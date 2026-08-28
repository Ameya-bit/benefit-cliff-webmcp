import { usePeiraStore } from "./state/store";
import { SweepChart } from "./components/SweepChart";
import "./App.css";

export default function App() {
  const household = usePeiraStore((s) => s.household);
  const sweep = usePeiraStore((s) => s.sweep);
  const probeLog = usePeiraStore((s) => s.probeLog);

  return (
    <main className="app">
      <header>
        <h1>Peira</h1>
        <p className="tagline">
          probe the benefits mechanism — πεῖρα, the root of <em>empirical</em>
        </p>
      </header>

      <section className="household-card">
        <h2>Household</h2>
        <ul>
          {household.adults.map((adult, i) => (
            <li key={`a${i}`}>
              Adult {i + 1}: age {adult.age}, ${adult.employment_income.toLocaleString()}/yr
            </li>
          ))}
          {household.children.map((child, i) => (
            <li key={`c${i}`}>
              Child {i + 1}: age {child.age}, childcare $
              {child.yearly_childcare_expenses.toLocaleString()}/yr
            </li>
          ))}
          <li>
            {household.state}
            {household.receiving_childcare_subsidy ? " · receiving childcare subsidy" : ""}
          </li>
        </ul>
      </section>

      <section className="canvas">
        <SweepChart sweep={sweep} />
      </section>

      <section className="probe-log">
        <h2>Probe log</h2>
        {probeLog.length === 0 && <p>No probes yet.</p>}
        <ul>
          {probeLog.map((entry) => (
            <li key={entry.id}>
              <span className={`source source-${entry.source}`}>{entry.source}</span>{" "}
              <code>{entry.tool}</code> — {entry.summary}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
