/**
 * Headless end-to-end check of the agent probe pipeline: executes the real
 * WebMCP tool handlers (the exact code an agent triggers) against a running
 * backend. Run: node --experimental-strip-types scripts/probe-e2e.ts
 */
import { TOOLS } from "../src/webmcp/tools.ts";
import { usePeiraStore } from "../src/state/store.ts";

const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

const setResult = await byName.set_household.execute({
  adults: [{ age: 30, employment_income: 50_000 }],
  children: [{ age: 3, yearly_childcare_expenses: 15_000 }],
  receiving_childcare_subsidy: true,
});
console.log("set_household ->", JSON.stringify(setResult, null, 1));

const sweepResult = await byName.sweep.execute({});
console.log("sweep ->", JSON.stringify(sweepResult, null, 1));

const state = usePeiraStore.getState();
if (!state.sweep || state.sweep.x.length !== 101) throw new Error("sweep not in store");
if (state.probeLog.length !== 2) throw new Error("probe log incomplete");
const cliffs = (sweepResult as { cliffs: unknown[] }).cliffs;
if (!cliffs.length) throw new Error("no cliffs returned");

// Raw execute throws on invalid input; register.ts converts throws into
// {error} payloads for the agent. Expect the throw here.
const rejected = await byName.sweep
  .execute({ min: 90_000, max: 10_000 })
  .then(() => false)
  .catch(() => true);
if (!rejected) throw new Error("invalid sweep input was not rejected");

// --- Step 5 verbs ---

const trace = (await byName.trace_binding_constraint.execute({ at: 80_000 })) as {
  binding_program: string;
};
console.log("trace ->", JSON.stringify(trace));
if (trace.binding_program !== "childcare") throw new Error("trace wrong program");
if (usePeiraStore.getState().trace?.dominant_program !== "childcare")
  throw new Error("trace not in store");

const ablate = (await byName.ablate_program.execute({ program: "tanf" })) as {
  hidden_interactions: string[];
};
console.log("ablate ->", JSON.stringify(ablate.hidden_interactions));
if (!ablate.hidden_interactions.some((s) => s.includes("snap")))
  throw new Error("TANF ablation did not reveal SNAP dependency");
if (usePeiraStore.getState().view.mode !== "ablate")
  throw new Error("ablate view not active");
usePeiraStore.getState().restoreBaseline();
if (usePeiraStore.getState().view.mode !== "sweep")
  throw new Error("restore failed");

const diff = (await byName.diff_scenarios.execute({
  label: "kid turns 6",
  changes: { children: [{ age: 6, yearly_childcare_expenses: 8_000 }] },
})) as { net_resources_gap: object };
console.log("diff ->", JSON.stringify(diff));
if (usePeiraStore.getState().view.mode !== "diff")
  throw new Error("diff view not active");

const heat = (await byName.sweep_2d.execute({})) as { grid: string };
console.log("sweep_2d ->", JSON.stringify(heat));
if (usePeiraStore.getState().view.mode !== "heatmap")
  throw new Error("heatmap view not active");

await byName.annotate.execute({ x: 80_000, note: "CCAP exit test binds here" });
if (usePeiraStore.getState().annotations.length !== 1)
  throw new Error("annotation missing");

// --- Step 7 finale verbs ---

const edited = (await byName.edit_policy.execute({
  parameter: "ccap_exit_smi_rate",
  value: 1.1,
})) as { cliffs_under_reform: string[] };
console.log("edit_policy reformed cliffs ->", JSON.stringify(edited.cliffs_under_reform));
if (edited.cliffs_under_reform.some((c) => c.includes("childcare")))
  throw new Error("exit=1.1 should remove childcare cliffs");
if (usePeiraStore.getState().view.mode !== "reform")
  throw new Error("reform view not active");
usePeiraStore.getState().restoreBaseline();

const fix = (await byName.find_minimal_fix.execute({ cliff_at: 80_000 })) as {
  healed: boolean;
  change: string;
  search_path: string[];
};
console.log("find_minimal_fix ->", JSON.stringify(fix, null, 1));
if (!fix.healed) throw new Error("minimal fix should heal the CCAP cliff");
if (usePeiraStore.getState().view.mode !== "reform")
  throw new Error("minimal-fix reform view not active");

console.log("\nE2E OK: canvas state populated, compact results returned");
