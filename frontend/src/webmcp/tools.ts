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
import {
  annotate,
  runAblation,
  runDiff,
  runEditPolicy,
  runMinimalFix,
  runSweep,
  runSweep2D,
  runTrace,
  setHousehold,
} from "../probes/runProbes";
import { usePeiraStore } from "../state/store";
import type { Household } from "../types";

const PROGRAM_SLUGS = [
  "snap",
  "tanf",
  "medicaid",
  "chip",
  "childcare",
  "eitc",
  "ctc",
  "aca",
] as const;

/** Must mirror the backend whitelist in app/policy.py — the mechanism's
 * editable dials. trace_binding_constraint results name these ids. */
const POLICY_PARAMETERS = [
  "ccap_exit_smi_rate",
  "ccap_entry_smi_rate",
  "snap_gross_income_limit",
  "ctc_fully_refundable",
] as const;

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
      const point = await setHousehold(household, "agent");
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
      const sweep = await runSweep(range, "agent");
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
  {
    name: "trace_binding_constraint",
    description:
      "At one earnings point, identify WHICH program's rule is the binding " +
      "constraint driving the local behavior — the mechanism's intermediate " +
      "state, not just its input-output curve. Defaults to the cliff " +
      "currently selected on the canvas (the human may have clicked one). " +
      "Lights up the responsible layer on the shared canvas. Use after a " +
      "sweep, when the human asks WHY a cliff happens.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        at: {
          type: "number",
          description:
            "yearly earnings point to interrogate, in $. Omit to use the cliff selected on the canvas.",
        },
      },
      additionalProperties: false,
    },
    async execute(input) {
      const parsed = z
        .object({ at: z.number().min(0).max(1_000_000).optional() })
        .parse(input);
      const selected = usePeiraStore.getState().selectedCliff;
      const at = parsed.at ?? selected?.from_x;
      if (at === undefined) {
        throw new Error(
          "no point given and no cliff selected on the canvas — pass `at` or ask the human to click a cliff",
        );
      }
      const trace = await runTrace(at, "agent");
      const losses = Object.entries(trace.program_deltas)
        .filter(([, v]) => v < -1)
        .map(([slug, v]) => `${slug}: ${money(v)}`);
      return {
        at: money(at),
        crossing_effect_on_net_resources: money(trace.net_income_delta),
        binding_program: trace.dominant_program,
        binding_rules: trace.binding_rules.map((rule) => ({
          rule: rule.rule,
          who: rule.person ?? "whole household",
          flips: `${rule.before} -> ${rule.after}`,
          editable_with: rule.editable_parameter
            ? `edit_policy parameter '${rule.editable_parameter.id}' (currently ${rule.editable_parameter.current_value} ${rule.editable_parameter.unit})`
            : null,
        })),
        all_program_changes: losses,
        note:
          trace.binding_rules.length > 0
            ? `The ${trace.dominant_program} layer is highlighted on the canvas and the mechanism inspector names the rule. Where a rule lists an editable parameter, edit_policy can move that threshold.`
            : `No eligibility gate flips here — this is a phase-out slope of ${trace.dominant_program}, not a cliff rule.`,
      };
    },
  },
  {
    name: "ablate_program",
    description:
      "Knock one program out of the mechanism entirely and re-run the " +
      "current sweep — the layer collapses on the shared canvas. Reveals " +
      "hidden interactions: programs whose eligibility silently depends on " +
      "the ablated one also move (e.g. TANF carries SNAP's categorical " +
      "eligibility). The returned `interactions` lists every OTHER program " +
      "whose totals changed. The human can restore the baseline from the " +
      "canvas banner.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        program: { type: "string", enum: [...PROGRAM_SLUGS] },
      },
      required: ["program"],
      additionalProperties: false,
    },
    async execute(input) {
      const { program } = z
        .object({ program: z.enum(PROGRAM_SLUGS) })
        .parse(input);
      const result = await runAblation(program, "agent");
      const interactions = Object.entries(result.interactions).map(
        ([slug, total]) =>
          `${slug} ${total < 0 ? "lost" : "gained"} ${money(Math.abs(total))} summed across the sweep`,
      );
      return {
        ablated: program,
        hidden_interactions:
          interactions.length > 0
            ? interactions
            : "no other program depends on it for this household",
        remaining_cliffs: result.ablated.cliffs.map(
          (c) => `${money(c.from_x)}: ${money(c.net_drop)} (${c.dominant_program})`,
        ),
        note: "The canvas is showing the ablated mechanism; the removed layer visibly collapsed.",
      };
    },
  },
  {
    name: "diff_scenarios",
    description:
      "Counterfactual probe: compare the current household against a " +
      "variant along the same earnings sweep — marriage or a second earner " +
      "(add an adult), a kid aging past a threshold, different childcare " +
      "costs, or losing subsidy enrollment. Pass ONLY the fields that " +
      "change; everything else carries over. Renders both net-resource " +
      "curves overlaid on the shared canvas with the gap shaded. Use for " +
      "'what if' questions a single sweep can't answer.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description: "short human-readable name for the variant, e.g. 'married' or 'kid turns 6'",
        },
        changes: {
          type: "object",
          description: "fields of the household to replace in the variant",
          properties: {
            adults: {
              type: "array",
              minItems: 1,
              maxItems: 2,
              items: {
                type: "object",
                properties: {
                  age: { type: "integer" },
                  employment_income: { type: "number" },
                  weekly_work_hours: { type: "number" },
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
                  age: { type: "integer" },
                  yearly_childcare_expenses: { type: "number" },
                },
                required: ["age"],
              },
            },
            receiving_childcare_subsidy: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
      required: ["label", "changes"],
      additionalProperties: false,
    },
    async execute(input) {
      const parsed = z
        .object({
          label: z.string().min(1).max(60),
          changes: z
            .object({
              adults: z.array(AdultSchema).min(1).max(2).optional(),
              children: z.array(ChildSchema).max(6).optional(),
              receiving_childcare_subsidy: z.boolean().optional(),
            })
            .strict(),
        })
        .parse(input);
      const current = usePeiraStore.getState().household;
      const variant: Household = { ...current, ...parsed.changes };
      const diff = await runDiff(variant, parsed.label, "agent");
      const deltas = diff.net_income_delta;
      const maxGain = Math.max(...deltas);
      const maxLoss = Math.min(...deltas);
      const crossings = deltas.filter(
        (d, i) => i > 0 && Math.sign(d) !== Math.sign(deltas[i - 1]),
      ).length;
      return {
        variant: parsed.label,
        net_resources_gap: {
          best_case_for_variant: money(maxGain),
          worst_case_for_variant: money(maxLoss),
          sign_changes_along_sweep: crossings,
        },
        note: "Both curves are overlaid on the shared canvas with the gap shaded — point the human at where they cross.",
      };
    },
  },
  {
    name: "sweep_2d",
    description:
      "Probe TWO inputs at once: yearly earnings × yearly childcare cost, " +
      "rendered as a net-resources heatmap on the shared canvas. Cliffs " +
      "appear as ridges. This is the probe a human with a slider cannot do " +
      "by hand — use it to find safe income regions or to show how a " +
      "cliff's position depends on childcare costs.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        max_earnings: { type: "number", description: "x-axis top, $ (default 100000)" },
        max_childcare_cost: { type: "number", description: "y-axis top, $ (default 30000)" },
      },
      additionalProperties: false,
    },
    async execute(input) {
      const parsed = z
        .object({
          max_earnings: z.number().min(10_000).max(1_000_000).default(100_000),
          max_childcare_cost: z.number().min(1_000).max(100_000).default(30_000),
        })
        .parse(input);
      if (usePeiraStore.getState().household.children.length === 0) {
        throw new Error("2D sweeps need at least one child (the y axis is that child's childcare cost)");
      }
      const heatmap = await runSweep2D(
        { variable: "employment_income", min: 0, max: parsed.max_earnings, count: 41 },
        { variable: "pre_subsidy_childcare_expenses", min: 0, max: parsed.max_childcare_cost, count: 21 },
        "agent",
      );
      const flat = heatmap.net_income.flat();
      return {
        grid: "41 earnings steps × 21 childcare-cost steps",
        net_resources_range: `${money(Math.min(...flat))} to ${money(Math.max(...flat))}`,
        note: "Heatmap rendered on the shared canvas; dark ridges are cliff lines. Scrub it with the human.",
      };
    },
  },
  {
    name: "annotate",
    description:
      "Pin a finding to the shared canvas at an earnings point, under your " +
      "own identity as the agent. Use it to mark what a probe established " +
      "('CCAP exit test binds here — a $1k raise costs $10.6k') so the " +
      "investigation accumulates on screen. Keep notes short and factual.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number", description: "yearly earnings point to pin at, in $" },
        note: { type: "string", description: "the finding, max 120 chars" },
      },
      required: ["x", "note"],
      additionalProperties: false,
    },
    async execute(input) {
      const parsed = z
        .object({
          x: z.number().min(0).max(1_000_000),
          note: z.string().min(1).max(120),
        })
        .parse(input);
      annotate(parsed.x, parsed.note, "agent");
      return { pinned: `“${parsed.note}” at ${money(parsed.x)}` };
    },
  },
  {
    name: "edit_policy",
    description:
      "Modify the mechanism itself: change one whitelisted policy parameter " +
      "and re-run the sweep. The canvas morphs from current law to the " +
      "reformed mechanism — cliffs move, shrink, or heal on screen. " +
      "trace_binding_constraint names which parameter moves a given rule. " +
      "This edits the simulation only, never real policy; the human can " +
      "restore current law from the canvas banner.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        parameter: {
          type: "string",
          enum: [...POLICY_PARAMETERS],
          description:
            "ccap_exit_smi_rate: CCAP exit limit, fraction of state median income (current 0.85, up to 2.0). " +
            "ccap_entry_smi_rate: CCAP entry limit, same units. " +
            "snap_gross_income_limit: SNAP gross test, multiple of poverty line (current 1.3, up to 3.0). " +
            "ctc_fully_refundable: boolean.",
        },
        value: {
          type: ["number", "boolean"],
          description: "the new value, within the parameter's bounds",
        },
      },
      required: ["parameter", "value"],
      additionalProperties: false,
    },
    async execute(input) {
      const parsed = z
        .object({
          parameter: z.enum(POLICY_PARAMETERS),
          value: z.union([z.number(), z.boolean()]),
        })
        .parse(input);
      const label = `${parsed.parameter} → ${parsed.value}`;
      const result = await runEditPolicy(
        { [parsed.parameter]: parsed.value },
        label,
        "agent",
      );
      const describe = (cliffs: { from_x: number; net_drop: number; dominant_program: string }[]) =>
        cliffs.map((c) => `${money(c.from_x)}: ${money(c.net_drop)} (${c.dominant_program})`);
      return {
        edited: label,
        cliffs_under_current_law: describe(result.baseline.cliffs),
        cliffs_under_reform: describe(result.reformed.cliffs),
        note: "The canvas morphed from current law to the reformed mechanism; a ghost line shows where net resources used to sit.",
      };
    },
  },
  {
    name: "find_minimal_fix",
    description:
      "Search policy-space for the SMALLEST whitelisted parameter change " +
      "that removes a cliff entirely (not merely moves it). Traces the " +
      "cliff to its binding rule, walks that rule's editable dial outward, " +
      "and bisects back for minimality — several reformed mechanisms are " +
      "built, so this probe takes up to a minute. Defaults to the cliff " +
      "selected on the canvas. The finale probe: run it when the human " +
      "asks 'could this be fixed?'",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        cliff_at: {
          type: "number",
          description:
            "earnings point of the cliff to heal, in $. Omit to use the cliff selected on the canvas.",
        },
      },
      additionalProperties: false,
    },
    async execute(input) {
      const parsed = z
        .object({ cliff_at: z.number().min(0).max(1_000_000).optional() })
        .parse(input);
      const selected = usePeiraStore.getState().selectedCliff;
      const cliffAt = parsed.cliff_at ?? selected?.from_x;
      if (cliffAt === undefined) {
        throw new Error(
          "no cliff given and none selected on the canvas — pass `cliff_at` or ask the human to click a cliff",
        );
      }
      const result = await runMinimalFix(cliffAt, "agent");
      if (!result.found) {
        return {
          healed: false,
          program: result.program,
          reason: result.reason,
        };
      }
      return {
        healed: result.healed,
        parameter: `${result.parameter!.label} (${result.parameter!.id})`,
        change: `${result.parameter!.default} → ${result.minimal_value} ${result.parameter!.unit}`,
        search_path: result.tried!.map(
          (t) =>
            `${t.value}: ${t.remaining_cliffs} ${result.program} cliff(s) left` +
            (t.worst_drop < 0 ? ` (worst ${money(t.worst_drop)})` : ""),
        ),
        note: result.healed
          ? "The cliff healed on the canvas — the reformed mechanism phases the program out smoothly where the threshold used to cut it off. A ghost line shows current law."
          : "No single whitelisted change removes it fully; the canvas shows the best attempt.",
      };
    },
  },
];
