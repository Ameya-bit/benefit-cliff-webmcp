/**
 * Human-facing probe presets shared by the bench controls: the whitelisted
 * policy dials (mirrors edit_policy in tools.ts / backend app/policy.py)
 * and the one-click what-if life changes.
 */

import type { Household } from "../types";

export interface PolicyDial {
  id: string;
  label: string;
  isBoolean: boolean;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
}

export const POLICY_DIALS: PolicyDial[] = [
  { id: "ccap_exit_smi_rate", label: "Childcare exit limit (× state median)", isBoolean: false, defaultValue: 0.85, min: 0.5, max: 2, step: 0.05 },
  { id: "ccap_entry_smi_rate", label: "Childcare entry limit (× state median)", isBoolean: false, defaultValue: 0.85, min: 0.5, max: 2, step: 0.05 },
  { id: "snap_gross_income_limit", label: "Food-aid gross limit (× poverty line)", isBoolean: false, defaultValue: 1.3, min: 1, max: 3, step: 0.1 },
  { id: "ctc_fully_refundable", label: "Child tax credit fully refundable", isBoolean: true, defaultValue: 0, min: 0, max: 1, step: 1 },
];

export interface DiffPreset {
  label: string;
  isAvailable: (h: Household) => boolean;
  variant: (h: Household) => Partial<Household>;
}

export const DIFF_PRESETS: DiffPreset[] = [
  {
    label: "+ partner",
    isAvailable: (h) => h.adults.length < 2,
    variant: (h) => ({
      adults: [...h.adults, { age: 30, employment_income: 0, weekly_work_hours: 40 }],
    }),
  },
  {
    label: "kids 3yrs older",
    isAvailable: (h) => h.children.length > 0,
    variant: (h) => ({
      children: h.children.map((c) => ({ ...c, age: Math.min(c.age + 3, 17) })),
    }),
  },
  {
    label: "off childcare assistance",
    isAvailable: (h) => h.receiving_childcare_subsidy,
    variant: () => ({ receiving_childcare_subsidy: false }),
  },
];
