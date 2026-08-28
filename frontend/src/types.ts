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
