import type { SweepResult } from "../types";

const WIDTH = 720;
const HEIGHT = 360;
const PAD = 40;

/** Step 3 placeholder: net-income line + cliff markers, enough to prove the
 * probe pipeline end to end. The animated stacked decomposition replaces this
 * in Step 4. */
export function SweepChart({ sweep }: { sweep: SweepResult | null }) {
  if (!sweep) {
    return (
      <div className="chart-empty">
        No sweep yet — ask the agent to probe this household, or run one from
        the canvas.
      </div>
    );
  }

  const xMax = Math.max(...sweep.x);
  const yMax = Math.max(...sweep.net_income) * 1.05;
  const sx = (v: number) => PAD + (v / xMax) * (WIDTH - 2 * PAD);
  const sy = (v: number) => HEIGHT - PAD - (v / yMax) * (HEIGHT - 2 * PAD);

  const path = sweep.x
    .map((x, i) => `${i === 0 ? "M" : "L"}${sx(x)},${sy(sweep.net_income[i])}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="sweep-chart">
      <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="#666" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} stroke="#666" />
      <path d={path} fill="none" stroke="#4f8ef7" strokeWidth={2} />
      {sweep.cliffs.map((cliff) => {
        const i = sweep.x.indexOf(cliff.from_x);
        return (
          <g key={cliff.from_x}>
            <circle cx={sx(cliff.from_x)} cy={sy(sweep.net_income[i])} r={5} fill="#e5484d" />
            <text
              x={sx(cliff.from_x)}
              y={sy(sweep.net_income[i]) - 10}
              textAnchor="middle"
              fontSize={11}
              fill="#e5484d"
            >
              {cliff.dominant_program} {Math.round(cliff.net_drop).toLocaleString()}
            </text>
          </g>
        );
      })}
      <text x={WIDTH - PAD} y={HEIGHT - 12} textAnchor="end" fontSize={11} fill="#888">
        yearly earnings ($)
      </text>
      <text x={PAD} y={PAD - 8} fontSize={11} fill="#888">
        net resources ($)
      </text>
    </svg>
  );
}
