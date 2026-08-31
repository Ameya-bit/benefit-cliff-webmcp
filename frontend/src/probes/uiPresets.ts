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
  { id: "ccap_exit_smi_rate", label: "Income limit to keep childcare help (× CO median income)", isBoolean: false, defaultValue: 0.85, min: 0.5, max: 2, step: 0.05 },
  { id: "ccap_entry_smi_rate", label: "Income limit to start childcare help (× CO median income)", isBoolean: false, defaultValue: 0.85, min: 0.5, max: 2, step: 0.05 },
  { id: "snap_gross_income_limit", label: "Income limit for food aid (× poverty line)", isBoolean: false, defaultValue: 1.3, min: 1, max: 3, step: 0.1 },
  { id: "ctc_fully_refundable", label: "Child tax credit paid even with no tax bill", isBoolean: true, defaultValue: 0, min: 0, max: 1, step: 1 },
];

export interface DiffPreset {
  label: string;
  isAvailable: (h: Household) => boolean;
  /** Optional knob the human can turn before running (the agent already
   * builds arbitrary households; this keeps the humans on equal footing). */
  param?: {
    label: string;
    defaultValue: number;
    min: number;
    max: number;
    step: number;
  };
  /** value is the param (or its default when the preset has none). */
  variant: (h: Household, value: number) => Partial<Household>;
  /** Label for the run, with the chosen value spelled out. */
  runLabel: (value: number) => string;
}

const fmtK = (v: number) =>
  Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;

/* Menu labels speak to the user ("you married…"); runLabels are noun
 * phrases because they land mid-sentence — "life with {label}",
 * "{label} means +$2,000 a year". */
export const DIFF_PRESETS: DiffPreset[] = [
  {
    label: "you married",
    isAvailable: (h) => h.adults.length < 2,
    param: { label: "partner earns $/yr", defaultValue: 0, min: 0, max: 200_000, step: 1000 },
    variant: (h, value) => ({
      adults: [...h.adults, { age: 30, employment_income: value, weekly_work_hours: 40 }],
    }),
    runLabel: (value) =>
      value > 0 ? `a partner earning ${fmtK(value)}` : "a partner (no income)",
  },
  {
    label: "the kids got older",
    isAvailable: (h) => h.children.length > 0,
    param: { label: "years older", defaultValue: 3, min: 1, max: 10, step: 1 },
    variant: (h, value) => ({
      children: h.children.map((c) => ({ ...c, age: Math.min(c.age + value, 17) })),
    }),
    runLabel: (value) => `the kids ${value} year${value === 1 ? "" : "s"} older`,
  },
  {
    label: "you lost childcare assistance",
    isAvailable: (h) => h.receiving_childcare_subsidy,
    variant: () => ({ receiving_childcare_subsidy: false }),
    runLabel: () => "no childcare assistance",
  },
];
