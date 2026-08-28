/**
 * Headless end-to-end check of the agent probe pipeline: executes the real
 * WebMCP tool handlers (the exact code an agent triggers) against a running
 * backend. Run: npx tsx scripts/probe-e2e.ts
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
const sweepReply = sweepResult as {
  cliffs: { worse_off_until: string }[];
  dead_zones: string[];
  curve_shape: string[];
  this_family: { next_cliff: string };
};
if (!sweepReply.cliffs.length) throw new Error("no cliffs returned");

// --- Step 7.5: sweep reply carries analysis, not just cliff locations ---
if (!sweepReply.cliffs.every((c) => typeof c.worse_off_until === "string"))
  throw new Error("sweep cliffs missing recovery points");
if (sweepReply.curve_shape.length !== 9) throw new Error("sweep missing curve checkpoints");
if (!Array.isArray(sweepReply.dead_zones)) throw new Error("sweep missing dead zones");
if (typeof sweepReply.this_family?.next_cliff !== "string")
  throw new Error("sweep missing you-are-here (default household earns $50k, cliffs ahead)");

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
if (!ablate.hidden_interactions.some((s) => s.includes("between earnings")))
  throw new Error("ablate interactions missing bite ranges");
if (usePeiraStore.getState().view.mode !== "ablate")
  throw new Error("ablate view not active");
usePeiraStore.getState().restoreBaseline();
if (usePeiraStore.getState().view.mode !== "sweep")
  throw new Error("restore failed");

const diff = (await byName.diff_scenarios.execute({
  label: "kid turns 6",
  changes: { children: [{ age: 6, yearly_childcare_expenses: 8_000 }] },
})) as {
  net_resources_gap: object;
  who_wins_where: string[];
  at_current_earnings: string;
};
console.log("diff ->", JSON.stringify(diff));
if (usePeiraStore.getState().view.mode !== "diff")
  throw new Error("diff view not active");
if (!diff.who_wins_where?.length) throw new Error("diff missing who-wins-where segments");
if (!diff.at_current_earnings?.includes("$"))
  throw new Error("diff missing at-current-earnings gap");

const heat = (await byName.sweep_2d.execute({})) as {
  grid: string;
  cliff_ridges_by_childcare_cost: { widest_safe_earnings_span: string }[];
};
console.log("sweep_2d ->", JSON.stringify(heat));
if (usePeiraStore.getState().view.mode !== "heatmap")
  throw new Error("heatmap view not active");
if (
  !heat.cliff_ridges_by_childcare_cost?.length ||
  !heat.cliff_ridges_by_childcare_cost.every((r) => r.widest_safe_earnings_span)
)
  throw new Error("sweep_2d missing ridge/safe-span summary");

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

// --- Step 7.5: query_point, human-action digest, get_workbench ---

usePeiraStore.getState().restoreBaseline();

const query = (await byName.query_point.execute({ points: [80_000, 85_000] })) as {
  curve: string;
  readings: { at: string; net_resources: string; programs: object }[];
};
console.log("query_point ->", JSON.stringify(query, null, 1));
if (query.curve !== "current law") throw new Error("query_point wrong curve label");
if (query.readings.length !== 2 || !query.readings[0].net_resources.startsWith("$"))
  throw new Error("query_point readings malformed");

const outOfRange = await byName.query_point
  .execute({ points: [250_000] })
  .then(() => false)
  .catch(() => true);
if (!outOfRange) throw new Error("query_point accepted an out-of-range point");

// Simulate the human acting on the bench, then verify the agent's next reply
// digests it — the pull-only workaround for WebMCP having no push channel.
const storeNow = usePeiraStore.getState();
storeNow.selectCliff(storeNow.sweep!.cliffs[0], "human");
const afterHuman = (await byName.query_point.execute({ points: [80_000] })) as {
  human_did_meanwhile?: string[];
};
if (!afterHuman.human_did_meanwhile?.some((s) => s.includes("select_cliff")))
  throw new Error("human cliff click did not reach the agent via the reply digest");
const again = (await byName.query_point.execute({ points: [80_000] })) as {
  human_did_meanwhile?: string[];
};
if (again.human_did_meanwhile) throw new Error("digest repeated already-seen human actions");

const bench = (await byName.get_workbench.execute({})) as {
  household: object;
  canvas: string;
  selected_cliff: string | null;
  pinned_notes: string[];
  recent_human_actions: string[];
};
console.log("get_workbench ->", JSON.stringify(bench, null, 1));
if (!bench.household || !bench.canvas) throw new Error("workbench snapshot incomplete");
if (!bench.selected_cliff) throw new Error("workbench missing human-selected cliff");
if (bench.pinned_notes.length !== 1) throw new Error("workbench missing pinned note");
if (!bench.recent_human_actions.some((s) => s.includes("select_cliff")))
  throw new Error("workbench missing human action history");

// Compact-results rule: every reply stays ≤ ~1KB of JSON.
const sized: [string, unknown][] = [
  ["sweep", sweepResult],
  ["diff", diff],
  ["sweep_2d", heat],
  ["query_point", query],
  ["get_workbench", bench],
];
for (const [name, reply] of sized) {
  const bytes = JSON.stringify(reply).length;
  console.log(`${name} reply: ${bytes} bytes`);
  if (bytes > 1600) throw new Error(`${name} reply too large (${bytes} bytes)`);
}

// --- Step 8: robustness + scenario-preset validity ---

// A probe that fails at the backend must surface on the bench (probeError),
// not vanish into an unhandled rejection.
const { runAblation } = await import("../src/probes/runProbes.ts");
const bogusRejected = await runAblation("nonsense", "human")
  .then(() => false)
  .catch(() => true);
if (!bogusRejected) throw new Error("backend accepted a bogus program name");
if (!usePeiraStore.getState().probeError)
  throw new Error("probe failure not surfaced on the bench");
usePeiraStore.getState().setProbeError(null);

// Every scenario preset must survive the real set_household path (zod +
// backend) — guards against preset drift breaking the demo on-ramp.
const { SCENARIO_PRESETS } = await import("../src/presets.ts");
for (const preset of SCENARIO_PRESETS) {
  const applied = (await byName.set_household.execute(
    preset.household as unknown as Record<string, unknown>,
  )) as { at_current_income?: { net_income?: string } };
  if (!applied.at_current_income?.net_income)
    throw new Error(`preset "${preset.label}" failed set_household`);
}
console.log(`all ${SCENARIO_PRESETS.length} scenario presets validated end-to-end`);

console.log("\nE2E OK: canvas state populated, compact analysis-bearing results returned");
