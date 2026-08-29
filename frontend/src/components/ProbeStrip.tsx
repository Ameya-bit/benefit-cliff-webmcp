/**
 * Labeled human probe controls above the map: one-click what-if life
 * changes (diff overlays) and the earnings × childcare safety grid. The
 * contextual verbs live where their objects are — ablate + the policy dial
 * in the reading modal; scrub/pin/cliff-select on the map itself.
 */

import { runDiff, runSweep2D } from "../probes/runProbes";
import { DIFF_PRESETS } from "../probes/uiPresets";
import { usePeiraStore } from "../state/store";

export function ProbeStrip() {
  const household = usePeiraStore((s) => s.household);
  const isProbing = usePeiraStore((s) => s.isProbing);

  const available = DIFF_PRESETS.filter((p) => p.isAvailable(household));

  return (
    <div className="probe-strip">
      {available.length > 0 && (
        <>
          <span className="strip-label">What if…</span>
          {available.map((preset) => (
            <button
              key={preset.label}
              className="btn"
              disabled={isProbing}
              title="Overlays the changed life against today's"
              onClick={() =>
                void runDiff(
                  { ...household, ...preset.variant(household) },
                  preset.label,
                  "human",
                ).catch(() => {})
              }
            >
              {preset.label}
            </button>
          ))}
          <span className="strip-divider" />
        </>
      )}
      <button
        className="btn"
        disabled={isProbing}
        title="Map earnings × childcare cost — cliffs appear as ridges"
        onClick={() =>
          void runSweep2D(
            { variable: "employment_income", min: 0, max: 100_000, count: 41 },
            { variable: "pre_subsidy_childcare_expenses", min: 0, max: 30_000, count: 21 },
            "human",
          ).catch(() => {})
        }
      >
        safety grid
      </button>
    </div>
  );
}
