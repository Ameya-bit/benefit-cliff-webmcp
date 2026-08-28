/**
 * The scenario library: preset households for the demo's non-raise use
 * cases, each paired with a suggested opening question for the agent.
 * Doubles as the on-ramp for cold visitors who arrive without an agent —
 * picking one fills the card and runs the first sweep.
 */

import type { Household } from "./types";

export interface ScenarioPreset {
  label: string;
  blurb: string;
  question: string;
  household: Household;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    label: "Weighing a raise",
    blurb: "Single parent on childcare assistance, wondering if more pay backfires.",
    question:
      "I'm a single parent in Denver making $50k, my 3-year-old's daycare runs $15k a year — is chasing a big raise actually worth it?",
    household: {
      state: "CO",
      adults: [{ age: 30, employment_income: 50_000, weekly_work_hours: 40 }],
      children: [{ age: 3, yearly_childcare_expenses: 15_000 }],
      receiving_childcare_subsidy: true,
    },
  },
  {
    label: "More hours?",
    blurb: "Part-time at $23/hr — do six more hours a week pay off?",
    question:
      "I work 32 hours a week at about $23 an hour — would moving up to 38 hours actually leave my family better off?",
    household: {
      state: "CO",
      adults: [{ age: 28, employment_income: 38_000, weekly_work_hours: 32 }],
      children: [{ age: 4, yearly_childcare_expenses: 12_000 }],
      receiving_childcare_subsidy: true,
    },
  },
  {
    label: "Marriage penalty?",
    blurb: "Would tying the knot cost this family its benefits?",
    question:
      "If I marry my partner who earns about $40k, what happens to our benefits?",
    household: {
      state: "CO",
      adults: [{ age: 32, employment_income: 35_000, weekly_work_hours: 40 }],
      children: [{ age: 2, yearly_childcare_expenses: 14_000 }],
      receiving_childcare_subsidy: true,
    },
  },
  {
    label: "New baby on the way",
    blurb: "A second child changes every program at once.",
    question:
      "We're expecting a second child — what does the new baby do to our benefits picture, including the extra childcare?",
    household: {
      state: "CO",
      adults: [{ age: 31, employment_income: 45_000, weekly_work_hours: 40 }],
      children: [{ age: 4, yearly_childcare_expenses: 13_000 }],
      receiving_childcare_subsidy: true,
    },
  },
  {
    label: "Kindergarten next year",
    blurb: "The childcare subsidy has age dynamics — what happens at 6?",
    question:
      "My daughter turns 6 and starts school next year, so daycare mostly goes away — how does our benefits picture change?",
    household: {
      state: "CO",
      adults: [{ age: 34, employment_income: 42_000, weekly_work_hours: 40 }],
      children: [{ age: 5, yearly_childcare_expenses: 15_000 }],
      receiving_childcare_subsidy: true,
    },
  },
  {
    label: "$12k side gig",
    blurb: "Extra 1099 income sounds free — is it?",
    question:
      "I make $40k and could pick up a side gig worth about $12k a year — after benefits, would I actually keep any of it?",
    household: {
      state: "CO",
      adults: [{ age: 27, employment_income: 40_000, weekly_work_hours: 40 }],
      children: [{ age: 3, yearly_childcare_expenses: 10_000 }],
      receiving_childcare_subsidy: true,
    },
  },
];
