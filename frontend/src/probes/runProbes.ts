/**
 * Probe runners shared by both participants: the agent's WebMCP tools and the
 * human's on-canvas controls call the same functions, log to the same probe
 * log, and render to the same canvas. One vocabulary, two hands.
 */

import { apiPost } from "../api/client";
import { usePeiraStore } from "../state/store";
import type {
  AblateResult,
  DiffResult,
  HeatmapResult,
  Household,
  SweepAxis,
  SweepResult,
  TraceResult,
} from "../types";

async function probing<T>(work: () => Promise<T>): Promise<T> {
  const store = usePeiraStore.getState();
  store.setProbing(true);
  try {
    return await work();
  } finally {
    usePeiraStore.getState().setProbing(false);
  }
}

export async function runSweep(
  range: { min: number; max: number },
  source: "agent" | "human",
): Promise<SweepResult> {
  return probing(async () => {
    const store = usePeiraStore.getState();
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
  });
}

export async function runAblation(
  program: string,
  source: "agent" | "human",
): Promise<AblateResult> {
  return probing(async () => {
    const store = usePeiraStore.getState();
    const axis = store.sweep?.axis ?? {
      variable: "employment_income",
      min: 0,
      max: 100_000,
      count: 101,
    };
    const result = await apiPost<AblateResult>("/ablate", {
      household: store.household,
      axis,
      program,
    });
    const ablatedSweep: SweepResult = {
      axis,
      x: result.baseline.x,
      ...result.ablated,
    };
    store.showAblation(ablatedSweep, result.baseline, program, result.interactions);
    store.logProbe({
      source,
      tool: "ablate_program",
      summary: `${program} knocked out — ${Object.keys(result.interactions).length} other program(s) moved`,
    });
    return result;
  });
}

export async function runDiff(
  householdB: Household,
  label: string,
  source: "agent" | "human",
): Promise<DiffResult> {
  return probing(async () => {
    const store = usePeiraStore.getState();
    const axis = store.sweep?.axis ?? {
      variable: "employment_income",
      min: 0,
      max: 100_000,
      count: 101,
    };
    const diff = await apiPost<DiffResult>("/diff", {
      household_a: store.household,
      household_b: householdB,
      axis,
    });
    store.setView({ mode: "diff", label, diff });
    store.logProbe({ source, tool: "diff_scenarios", summary: label });
    return diff;
  });
}

export async function runTrace(
  at: number,
  source: "agent" | "human",
): Promise<TraceResult> {
  return probing(async () => {
    const store = usePeiraStore.getState();
    const trace = await apiPost<TraceResult>("/trace", {
      household: store.household,
      at,
    });
    store.setTrace(trace);
    store.logProbe({
      source,
      tool: "trace_binding_constraint",
      summary: `at $${at.toLocaleString()}: ${trace.dominant_program} binds`,
    });
    return trace;
  });
}

export async function runSweep2D(
  axisX: SweepAxis,
  axisY: SweepAxis,
  source: "agent" | "human",
): Promise<HeatmapResult> {
  return probing(async () => {
    const store = usePeiraStore.getState();
    const heatmap = await apiPost<HeatmapResult>("/sweep2d", {
      household: store.household,
      axis_x: axisX,
      axis_y: axisY,
    });
    store.setView({ mode: "heatmap", heatmap });
    store.logProbe({
      source,
      tool: "sweep_2d",
      summary: `earnings × childcare cost grid (${axisX.count}×${axisY.count})`,
    });
    return heatmap;
  });
}

export function annotate(
  x: number,
  note: string,
  source: "agent" | "human",
): void {
  const store = usePeiraStore.getState();
  store.addAnnotation({ x, note, source });
  store.logProbe({
    source,
    tool: "annotate",
    summary: `pinned at $${x.toLocaleString()}: “${note.slice(0, 60)}”`,
  });
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
