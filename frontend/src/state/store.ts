import { create } from "zustand";
import { programLabel } from "../viz/palette";
import type {
  Annotation,
  CanvasView,
  Cliff,
  Household,
  ProbeLogEntry,
  SweepResult,
  TraceResult,
} from "../types";

/** The bench starts empty: one adult, no income, no kids. The human fills
 * the card (or loads a preset), the agent fills it via set_household — the
 * first Apply/preset/probe generates the flow and the map. */
export const DEFAULT_HOUSEHOLD: Household = {
  state: "CO",
  adults: [{ age: 30, employment_income: 0, weekly_work_hours: 40 }],
  children: [],
  receiving_childcare_subsidy: false,
};

/** One reopenable result in the "Explored so far" rail — the lab notebook.
 * Snapshots the canvas state a probe produced, so the human can flip back. */
export interface GalleryEntry {
  id: number;
  kind: "sweep" | "ablate" | "reform" | "diff" | "heatmap";
  title: string;
  source: "agent" | "human";
  sweep: SweepResult | null;
  baselineSweep: SweepResult | null;
  view: CanvasView;
}

const MAX_GALLERY = 12;

interface PeiraState {
  household: Household;
  /** The curves the stacked canvas currently shows (baseline or ablated). */
  sweep: SweepResult | null;
  /** Baseline kept aside while an ablation is displayed, for instant restore. */
  baselineSweep: SweepResult | null;
  view: CanvasView;
  /** Scrub position: index into the active sweep's x array. */
  currentIndex: number | null;
  /** Cursor pinned by a click on the plot — the money flow keeps showing
   * that income after the pointer leaves. Cleared when the canvas swaps. */
  pinnedIndex: number | null;
  setPinnedIndex: (index: number | null) => void;
  /** Cliff selected for interrogation (by its from_x), shared human<->agent. */
  selectedCliff: Cliff | null;
  /** Cliff income being hovered in the digest list — the map highlights it. */
  hoverCliffX: number | null;
  setHoverCliffX: (x: number | null) => void;
  /** Last binding-constraint trace; highlights its dominant program layer. */
  trace: TraceResult | null;
  annotations: Annotation[];
  probeLog: ProbeLogEntry[];
  isProbing: boolean;
  /** Narration for slow probes (reform rebuilds, the minimal-fix search) —
   * the ProbeProgress pill shows it with an elapsed counter. */
  probingLabel: string | null;
  /** Last failed probe's message, shown on the bench until dismissed or a
   * new probe starts. Agent and human failures both surface here. */
  probeError: string | null;
  /** null = not yet known; false = plain browser, no agent attached. */
  webmcpAvailable: boolean | null;
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
  /** Back to the scenario page (keeps household, log, and gallery intact). */
  goHome: () => void;
  setView: (view: CanvasView) => void;
  setCurrentIndex: (index: number | null) => void;
  selectCliff: (cliff: Cliff | null, source: "agent" | "human") => void;
  setTrace: (trace: TraceResult | null) => void;
  addAnnotation: (annotation: Omit<Annotation, "id">) => void;
  setProbing: (isProbing: boolean, label?: string | null) => void;
  setProbeError: (probeError: string | null) => void;
  setWebmcpAvailable: (webmcpAvailable: boolean) => void;
  logProbe: (entry: Omit<ProbeLogEntry, "id" | "timestamp">) => void;
  /** Program the explainer panel focuses on (clicked in the money flow). */
  focusProgram: string | null;
  setFocusProgram: (slug: string | null) => void;
  /** Reopenable probe results, oldest first. */
  gallery: GalleryEntry[];
  activeGalleryId: number | null;
  /** Snapshot the canvas state just produced by a probe into the rail. */
  pushGalleryFromCurrent: (
    kind: GalleryEntry["kind"],
    title: string,
    source: "agent" | "human",
  ) => void;
  /** Reopen an earlier result (human flipping back through the notebook). */
  restoreGallery: (id: number) => void;
  /** Rename a notebook entry to what was actually found there. */
  renameGallery: (id: number, title: string) => void;
  /** Log id up to which the agent has already been told about human actions. */
  lastAgentSeenLogId: number;
  /** Human-sourced log entries the agent hasn't seen yet (oldest first);
   * advances the pointer — WebMCP is pull-only, so tool replies piggyback
   * this digest to fake push. */
  digestHumanActions: () => ProbeLogEntry[];
}

let probeId = 0;

const logEntry = (
  entry: Omit<ProbeLogEntry, "id" | "timestamp">,
): ProbeLogEntry => ({ ...entry, id: ++probeId, timestamp: Date.now() });

export const usePeiraStore = create<PeiraState>((set, get) => ({
  household: DEFAULT_HOUSEHOLD,
  sweep: null,
  baselineSweep: null,
  view: { mode: "sweep" },
  currentIndex: null,
  pinnedIndex: null,
  setPinnedIndex: (pinnedIndex) => set({ pinnedIndex }),
  selectedCliff: null,
  hoverCliffX: null,
  setHoverCliffX: (hoverCliffX) => set({ hoverCliffX }),
  trace: null,
  annotations: [],
  probeLog: [],
  isProbing: false,
  probingLabel: null,
  probeError: null,
  webmcpAvailable: null,
  setHousehold: (household) => set({ household }),
  setSweep: (sweep) =>
    set({
      sweep,
      baselineSweep: null,
      view: { mode: "sweep" },
      selectedCliff: null,
      trace: null,
      pinnedIndex: null,
    }),
  showAblation: (ablatedSweep, baseline, program, interactions) =>
    set({
      sweep: ablatedSweep,
      baselineSweep: baseline,
      view: { mode: "ablate", program, interactions },
      selectedCliff: null,
      trace: null,
      pinnedIndex: null,
    }),
  showReform: (reformedSweep, baseline, label) =>
    set({
      sweep: reformedSweep,
      baselineSweep: baseline,
      view: { mode: "reform", label },
      selectedCliff: null,
      trace: null,
      pinnedIndex: null,
    }),
  restoreBaseline: () =>
    set((state) =>
      state.baselineSweep
        ? {
            sweep: state.baselineSweep,
            baselineSweep: null,
            view: { mode: "sweep" },
            pinnedIndex: null,
          }
        : {},
    ),
  goHome: () =>
    set({
      sweep: null,
      baselineSweep: null,
      view: { mode: "sweep" },
      selectedCliff: null,
      trace: null,
      currentIndex: null,
      pinnedIndex: null,
      focusProgram: null,
      activeGalleryId: null,
    }),
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
      // A trace explains ONE spot; keep it only if it was run at this cliff,
      // else the old rule/dimming bleeds into the new selection.
      trace: cliff && state.trace && state.trace.at !== cliff.from_x ? null : state.trace,
      probeLog: cliff
        ? [
            logEntry({
              source,
              tool: "select_cliff",
              summary: `looking closer at the $${cliff.from_x.toLocaleString()} cliff (${programLabel(cliff.dominant_program)})`,
            }),
            ...state.probeLog,
          ]
        : state.probeLog,
    })),
  setProbing: (isProbing, label) =>
    set({ isProbing, probingLabel: isProbing ? (label ?? null) : null }),
  setProbeError: (probeError) => set({ probeError }),
  setWebmcpAvailable: (webmcpAvailable) => set({ webmcpAvailable }),
  logProbe: (entry) =>
    set((state) => ({ probeLog: [logEntry(entry), ...state.probeLog] })),
  focusProgram: null,
  setFocusProgram: (focusProgram) => set({ focusProgram }),
  gallery: [],
  activeGalleryId: null,
  pushGalleryFromCurrent: (kind, title, source) => {
    set((state) => {
      // Re-running the same probe reactivates its snapshot instead of
      // filing a twin — the rail is a notebook, not a raw event log.
      const signature = (k: string, t: string, s: SweepResult | null) =>
        `${k}|${t}|${
          s
            ? `${s.axis.min}-${s.axis.max}|${Math.round(
                s.net_income.reduce((a, b) => a + b, 0),
              )}`
            : "none"
        }`;
      const sig = signature(kind, title, state.sweep);
      const existing = state.gallery.find(
        (e) => signature(e.kind, e.title, e.sweep) === sig,
      );
      if (existing) {
        return {
          gallery: [
            ...state.gallery.filter((e) => e.id !== existing.id),
            existing,
          ],
          activeGalleryId: existing.id,
        };
      }
      const id = ++probeId;
      return {
        gallery: [
          ...state.gallery,
          {
            id,
            kind,
            title,
            source,
            sweep: state.sweep,
            baselineSweep: state.baselineSweep,
            view: state.view,
          },
        ].slice(-MAX_GALLERY),
        activeGalleryId: id,
      };
    });
  },
  restoreGallery: (id) =>
    set((state) => {
      const entry = state.gallery.find((e) => e.id === id);
      if (!entry) return {};
      return {
        sweep: entry.sweep,
        baselineSweep: entry.baselineSweep,
        view: entry.view,
        selectedCliff: null,
        trace: null,
        pinnedIndex: null,
        activeGalleryId: id,
      };
    }),
  renameGallery: (id, title) =>
    set((state) => ({
      gallery: state.gallery.map((entry) =>
        entry.id === id && title.trim().length > 0
          ? { ...entry, title: title.trim() }
          : entry,
      ),
    })),
  lastAgentSeenLogId: 0,
  digestHumanActions: () => {
    const { probeLog, lastAgentSeenLogId } = get();
    const unseen = probeLog
      .filter((e) => e.source === "human" && e.id > lastAgentSeenLogId)
      .reverse();
    const newestId = probeLog[0]?.id ?? lastAgentSeenLogId;
    set({ lastAgentSeenLogId: newestId });
    return unseen;
  },
}));
