import { create } from "zustand";
import type { Household, ProbeLogEntry, SweepResult } from "../types";

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
  probeLog: ProbeLogEntry[];
  setHousehold: (household: Household) => void;
  setSweep: (sweep: SweepResult) => void;
  logProbe: (entry: Omit<ProbeLogEntry, "id" | "timestamp">) => void;
}

let probeId = 0;

export const usePeiraStore = create<PeiraState>((set) => ({
  household: DEFAULT_HOUSEHOLD,
  sweep: null,
  probeLog: [],
  setHousehold: (household) => set({ household }),
  setSweep: (sweep) => set({ sweep }),
  logProbe: (entry) =>
    set((state) => ({
      probeLog: [
        { ...entry, id: ++probeId, timestamp: Date.now() },
        ...state.probeLog,
      ],
    })),
}));
