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

console.log("\nE2E OK: canvas state populated, compact results returned");
