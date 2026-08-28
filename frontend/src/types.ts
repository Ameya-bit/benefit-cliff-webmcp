export interface Adult {
  age: number;
  employment_income: number;
  weekly_work_hours: number;
}

export interface Child {
  age: number;
  yearly_childcare_expenses: number;
}

export interface Household {
  state: string;
  adults: Adult[];
  children: Child[];
  receiving_childcare_subsidy: boolean;
}

export interface SweepAxis {
  variable: string;
  min: number;
  max: number;
  count: number;
}

export interface Cliff {
  from_x: number;
  to_x: number;
  net_drop: number;
  dominant_program: string;
  program_deltas: Record<string, number>;
}

export interface SweepResult {
  axis: SweepAxis;
  x: number[];
  net_income: number[];
  programs: Record<string, number[]>;
  cliffs: Cliff[];
}

export interface ProbeLogEntry {
  id: number;
  timestamp: number;
  source: "agent" | "human";
  tool: string;
  summary: string;
}

export interface EditableParameter {
  id: string;
  label: string;
  path: string;
  current_value: number | boolean;
  unit: string;
}

export interface BindingRule {
  rule: string;
  variable: string;
  person: string | null;
  before: number | boolean;
  after: number | boolean;
  editable_parameter: EditableParameter | null;
}

export interface TraceResult {
  at: number;
  step: number;
  net_income_delta: number;
  program_deltas: Record<string, number>;
  dominant_program: string;
  binding_rules: BindingRule[];
}

export interface DiffResult {
  a: SweepResult;
  b: SweepResult;
  net_income_delta: number[];
}

export interface AblatedCurves {
  net_income: number[];
  programs: Record<string, number[]>;
  cliffs: Cliff[];
}

export interface AblateResult {
  program: string;
  baseline: SweepResult;
  ablated: AblatedCurves;
  interactions: Record<string, number>;
}

export interface HeatmapResult {
  axis_x: SweepAxis;
  axis_y: SweepAxis;
  net_income: number[][];
}

export interface Annotation {
  id: number;
  x: number;
  note: string;
  source: "agent" | "human";
}

export type CanvasView =
  | { mode: "sweep" }
  | { mode: "ablate"; program: string; interactions: Record<string, number> }
  | { mode: "diff"; label: string; diff: DiffResult }
  | { mode: "heatmap"; heatmap: HeatmapResult }
  | { mode: "reform"; label: string };

export interface MinimalFixAttempt {
  value: number | boolean;
  remaining_cliffs: number;
  worst_drop: number;
}

export interface MinimalFixResult {
  found: boolean;
  healed?: boolean;
  program: string;
  reason?: string;
  parameter?: {
    id: string;
    label: string;
    path: string;
    default: number | boolean;
    unit: string;
  };
  minimal_value?: number | boolean;
  tried?: MinimalFixAttempt[];
  baseline?: SweepResult;
  reformed?: SweepResult;
}

export interface ReformResult {
  baseline: SweepResult;
  reformed: SweepResult;
}
