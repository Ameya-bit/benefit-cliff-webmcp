/**
 * Peira's WebMCP tool vocabulary.
 *
 * Design rules (these are the product, not plumbing):
 * - Tools are PROBE VERBS on the benefits mechanism, not CRUD on the UI. The
 *   agent cannot fetch a summary or restructure the page; it can only run
 *   interventions whose results render on the shared canvas.
 * - Tool results are compact JSON *pointers* to what changed on screen —
 *   headline numbers and cliff attributions — never full curve arrays. The
 *   canvas is the shared memory; the human reads understanding off it.
 * - Every input is re-validated here with zod (the browser does not guarantee
 *   schema validation before execute runs) and again by the backend.
 *
 * Step 3 registers the first two verbs (set_household, sweep). The remaining
 * probes (diff_scenarios, ablate_program, trace_binding_constraint,
 * edit_policy, annotate) land in Steps 5-7.
 */

import { z } from "zod";
import { apiPost } from "../api/client";
import { usePeiraStore } from "../state/store";
import type { Household, SweepResult } from "../types";

const AdultSchema = z.object({
  age: z.number().int().min(18).max(100),
  employment_income: z.number().min(0).max(2_000_000).default(0),
  weekly_work_hours: z.number().min(0).max(100).default(40),
});

const ChildSchema = z.object({
  age: z.number().int().min(0).max(17),
  yearly_childcare_expenses: z.number().min(0).max(100_000).default(0),
});

const HouseholdSchema = z.object({
  state: z.literal("CO").default("CO"),
  adults: z.array(AdultSchema).min(1).max(2),
  children: z.array(ChildSchema).max(6).default([]),
  receiving_childcare_subsidy: z.boolean().default(false),
});

const SweepInputSchema = z.object({
  min: z.number().min(0).default(0),
  max: z.number().max(1_000_000).default(100_000),
});

const money = (value: number) =>
  `$${Math.round(value).toLocaleString("en-US")}`;

function currentHousehold(): Household {
  return usePeiraStore.getState().household;
}

export interface PeiraTool {
  name: string;
  description: string;
  inputSchema: object;
  readOnly: boolean;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

export const TOOLS: PeiraTool[] = [
  {
    name: "set_household",
    description:
      "Define the household under study — the specimen every probe runs " +
      "against. Fill it from what the human tells you about their family; " +
      "the human can correct it directly on the household card, so treat " +
      "the returned state as ground truth. Set " +
      "receiving_childcare_subsidy=true for a family already enrolled in " +
      "childcare assistance (their subsidy exit rules differ from a new " +
      "applicant's entry rules — this moves cliffs).",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["CO"], description: "US state (Colorado only for now)" },
        adults: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          items: {
            type: "object",
            properties: {
              age: { type: "integer", minimum: 18, maximum: 100 },
              employment_income: { type: "number", description: "yearly earnings in $" },
              weekly_work_hours: { type: "number", description: "default 40" },
            },
            required: ["age"],
          },
        },
        children: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              age: { type: "integer", minimum: 0, maximum: 17 },
              yearly_childcare_expenses: { type: "number", description: "yearly paid childcare in $" },
            },
            required: ["age"],
          },
        },
        receiving_childcare_subsidy: { type: "boolean" },
      },
      required: ["adults"],
      additionalProperties: false,
    },
    async execute(input) {
      const household = HouseholdSchema.parse(input) as Household;
      const store = usePeiraStore.getState();
      store.setHousehold(household);
      store.logProbe({
        source: "agent",
        tool: "set_household",
        summary: `${household.adults.length} adult(s), ${household.children.length} child(ren), ${household.state}`,
      });
      const point = await apiPost<{ net_income: number; programs: Record<string, number> }>(
        "/calculate",
        { household },
      );
      const active = Object.entries(point.programs)
        .filter(([, v]) => v > 0)
        .map(([slug, v]) => `${slug}: ${money(v)}/yr`);
      return {
        household,
        at_current_income: {
          net_income: money(point.net_income),
          active_programs: active,
        },
        note: "Household card updated on the shared canvas. Run sweep to map the mechanism around this family.",
      };
    },
  },
  {
    name: "sweep",
    description:
      "Run the benefits mechanism across a range of yearly earnings for the " +
      "current household and draw the result on the shared canvas as a " +
      "per-program decomposition. Returns the cliffs found: income points " +
      "where earning $1,000 more makes the family's net resources DROP, " +
      "attributed to the program that collapses. This is the opening probe " +
      "of almost every investigation; interrogate individual cliffs " +
      "afterwards with the human.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        min: { type: "number", description: "sweep start, yearly earnings in $ (default 0)" },
        max: { type: "number", description: "sweep end, yearly earnings in $ (default 100000)" },
      },
      additionalProperties: false,
    },
    async execute(input) {
      const range = SweepInputSchema.parse(input);
      if (range.max <= range.min) {
        throw new Error("sweep needs max > min");
      }
      const household = currentHousehold();
      const sweep = await apiPost<SweepResult>("/sweep", {
        household,
        axis: { variable: "employment_income", ...range, count: 101 },
      });
      const store = usePeiraStore.getState();
      store.setSweep(sweep);
      store.logProbe({
        source: "agent",
        tool: "sweep",
        summary: `${money(range.min)}–${money(range.max)}: ${sweep.cliffs.length} cliff(s)`,
      });
      return {
        swept: `yearly earnings ${money(range.min)} to ${money(range.max)}`,
        cliffs: sweep.cliffs.map((cliff) => ({
          crossing: `${money(cliff.from_x)} -> ${money(cliff.to_x)}`,
          net_resources_change: money(cliff.net_drop),
          dominant_program: cliff.dominant_program,
        })),
        note:
          sweep.cliffs.length > 0
            ? "Full decomposition is drawn on the shared canvas; the human can see which colored layer collapses at each cliff."
            : "No cliffs in this range; the curve on the canvas rises smoothly.",
      };
    },
  },
];
