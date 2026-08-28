import { create } from "zustand";
import type { Cliff, Household, ProbeLogEntry, SweepResult } from "../types";

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
  sweep: SweepResult | null;
  /** Scrub position: index into the active sweep's x array. */
  currentIndex: number | null;
  /** Cliff selected for interrogation (by its from_x), shared human<->agent. */
  selectedCliff: Cliff | null;
  probeLog: ProbeLogEntry[];
  isProbing: boolean;
  setHousehold: (household: Household) => void;
  setSweep: (sweep: SweepResult) => void;
  setCurrentIndex: (index: number | null) => void;
  selectCliff: (cliff: Cliff | null, source: "agent" | "human") => void;
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
  currentIndex: null,
  selectedCliff: null,
  probeLog: [],
  isProbing: false,
  setHousehold: (household) => set({ household }),
  setSweep: (sweep) => set({ sweep, selectedCliff: null }),
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
