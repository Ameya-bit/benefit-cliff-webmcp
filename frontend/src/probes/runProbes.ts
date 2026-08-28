/**
 * Probe runners shared by both participants: the agent's WebMCP tools and the
 * human's on-canvas controls call the same functions, log to the same probe
 * log, and render to the same canvas. One vocabulary, two hands.
 */

import { apiPost } from "../api/client";
import { usePeiraStore } from "../state/store";
import type { Household, SweepResult } from "../types";

export async function runSweep(
  range: { min: number; max: number },
  source: "agent" | "human",
): Promise<SweepResult> {
  const store = usePeiraStore.getState();
  store.setProbing(true);
  try {
    const sweep = await apiPost<SweepResult>("/sweep", {
      household: store.household,
      axis: { variable: "employment_income", ...range, count: 101 },
    });
    store.setSweep(sweep);
    store.logProbe({
      source,
      tool: "sweep",
      summary: `$${range.min.toLocaleString()}–$${range.max.toLocaleString()}: ${sweep.cliffs.length} cliff(s)`,
    });
    return sweep;
  } finally {
    usePeiraStore.getState().setProbing(false);
  }
}

export async function setHousehold(
  household: Household,
  source: "agent" | "human",
): Promise<{ net_income: number; programs: Record<string, number> }> {
  const store = usePeiraStore.getState();
  store.setHousehold(household);
  store.logProbe({
    source,
    tool: "set_household",
    summary: `${household.adults.length} adult(s), ${household.children.length} child(ren), ${household.state}`,
  });
  return apiPost("/calculate", { household });
}
