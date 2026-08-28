import { create } from "zustand";
import type {
  Annotation,
  CanvasView,
  Cliff,
  Household,
  ProbeLogEntry,
  SweepResult,
  TraceResult,
} from "../types";

/** The reference scenario: a Denver single parent already receiving CCAP,
 * weighing a raise. Every demo opens here unless the agent or human changes it. */
export const DEFAULT_HOUSEHOLD: Household = {
  state: "CO",
  adults: [{ age: 30, employment_income: 50_000, weekly_work_hours: 40 }],
  children: [{ age: 3, yearly_childcare_expenses: 15_000 }],
  receiving_childcare_subsidy: true,
};

interface PeiraState {
  household: Household;
  /** The curves the stacked canvas currently shows (baseline or ablated). */
  sweep: SweepResult | null;
  /** Baseline kept aside while an ablation is displayed, for instant restore. */
  baselineSweep: SweepResult | null;
  view: CanvasView;
  /** Scrub position: index into the active sweep's x array. */
  currentIndex: number | null;
  /** Cliff selected for interrogation (by its from_x), shared human<->agent. */
  selectedCliff: Cliff | null;
  /** Last binding-constraint trace; highlights its dominant program layer. */
  trace: TraceResult | null;
  annotations: Annotation[];
  probeLog: ProbeLogEntry[];
  isProbing: boolean;
  setHousehold: (household: Household) => void;
  setSweep: (sweep: SweepResult) => void;
  showAblation: (
    ablatedSweep: SweepResult,
    baseline: SweepResult,
    program: string,
    interactions: Record<string, number>,
  ) => void;
  showReform: (
    reformedSweep: SweepResult,
    baseline: SweepResult,
    label: string,
  ) => void;
  restoreBaseline: () => void;
  setView: (view: CanvasView) => void;
  setCurrentIndex: (index: number | null) => void;
  selectCliff: (cliff: Cliff | null, source: "agent" | "human") => void;
  setTrace: (trace: TraceResult | null) => void;
  addAnnotation: (annotation: Omit<Annotation, "id">) => void;
  setProbing: (isProbing: boolean) => void;
  logProbe: (entry: Omit<ProbeLogEntry, "id" | "timestamp">) => void;
}

let probeId = 0;

const logEntry = (
  entry: Omit<ProbeLogEntry, "id" | "timestamp">,
): ProbeLogEntry => ({ ...entry, id: ++probeId, timestamp: Date.now() });

export const usePeiraStore = create<PeiraState>((set) => ({
  household: DEFAULT_HOUSEHOLD,
  sweep: null,
  baselineSweep: null,
  view: { mode: "sweep" },
  currentIndex: null,
  selectedCliff: null,
  trace: null,
  annotations: [],
  probeLog: [],
  isProbing: false,
  setHousehold: (household) => set({ household }),
  setSweep: (sweep) =>
    set({
      sweep,
      baselineSweep: null,
      view: { mode: "sweep" },
      selectedCliff: null,
      trace: null,
    }),
  showAblation: (ablatedSweep, baseline, program, interactions) =>
    set({
      sweep: ablatedSweep,
      baselineSweep: baseline,
      view: { mode: "ablate", program, interactions },
      selectedCliff: null,
      trace: null,
    }),
  showReform: (reformedSweep, baseline, label) =>
    set({
      sweep: reformedSweep,
      baselineSweep: baseline,
      view: { mode: "reform", label },
      selectedCliff: null,
      trace: null,
    }),
  restoreBaseline: () =>
    set((state) =>
      state.baselineSweep
        ? {
            sweep: state.baselineSweep,
            baselineSweep: null,
            view: { mode: "sweep" },
          }
        : {},
    ),
  setView: (view) => set({ view }),
  setTrace: (trace) => set({ trace }),
  addAnnotation: (annotation) =>
    set((state) => ({
      annotations: [...state.annotations, { ...annotation, id: ++probeId }],
    })),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  selectCliff: (cliff, source) =>
    set((state) => ({
      selectedCliff: cliff,
      probeLog: cliff
        ? [
            logEntry({
              source,
              tool: "select_cliff",
              summary: `interrogating the $${cliff.from_x.toLocaleString()} cliff (${cliff.dominant_program})`,
            }),
            ...state.probeLog,
          ]
        : state.probeLog,
    })),
  setProbing: (isProbing) => set({ isProbing }),
  logProbe: (entry) =>
    set((state) => ({ probeLog: [logEntry(entry), ...state.probeLog] })),
}));
