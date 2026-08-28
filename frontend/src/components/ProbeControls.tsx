/**
 * The human's probe controls — the same verbs the agent has, wired to the
 * same runProbes functions with source: "human". Without these the human is
 * a spectator; with them the bench is genuinely shared: human-run probes
 * land in the probe log and reach the agent through the reply digest.
 */

import { useState } from "react";
import {
  annotate,
  runAblation,
  runDiff,
  runEditPolicy,
  runSweep,
} from "../probes/runProbes";
import { usePeiraStore } from "../state/store";
import type { Household } from "../types";
import { PROGRAM_SLUGS } from "../webmcp/tools";

interface PolicyDial {
  id: string;
  label: string;
  isBoolean: boolean;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
}

/** Mirrors the edit_policy whitelist (tools.ts / backend app/policy.py). */
const POLICY_DIALS: PolicyDial[] = [
  { id: "ccap_exit_smi_rate", label: "CCAP exit limit (× SMI)", isBoolean: false, defaultValue: 0.85, min: 0.5, max: 2, step: 0.05 },
  { id: "ccap_entry_smi_rate", label: "CCAP entry limit (× SMI)", isBoolean: false, defaultValue: 0.85, min: 0.5, max: 2, step: 0.05 },
  { id: "snap_gross_income_limit", label: "SNAP gross limit (× FPL)", isBoolean: false, defaultValue: 1.3, min: 1, max: 3, step: 0.1 },
  { id: "ctc_fully_refundable", label: "CTC fully refundable", isBoolean: true, defaultValue: 0, min: 0, max: 1, step: 1 },
];

interface DiffPreset {
  label: string;
  isAvailable: (h: Household) => boolean;
  variant: (h: Household) => Partial<Household>;
}

const DIFF_PRESETS: DiffPreset[] = [
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
    label: "off subsidy",
    isAvailable: (h) => h.receiving_childcare_subsidy,
    variant: () => ({ receiving_childcare_subsidy: false }),
  },
];

export function ProbeControls() {
  const isProbing = usePeiraStore((s) => s.isProbing);
  const hasSweep = usePeiraStore((s) => s.sweep !== null);
  const household = usePeiraStore((s) => s.household);
  const [range, setRange] = useState({ min: 0, max: 100_000 });
  const [program, setProgram] = useState<string>(PROGRAM_SLUGS[0]);
  const [dialId, setDialId] = useState(POLICY_DIALS[0].id);
  const [dialValue, setDialValue] = useState<number>(POLICY_DIALS[0].defaultValue);
  const [pin, setPin] = useState({ x: 80_000, note: "" });

  const dial = POLICY_DIALS.find((d) => d.id === dialId)!;

  const pickDial = (id: string) => {
    setDialId(id);
    const next = POLICY_DIALS.find((d) => d.id === id)!;
    setDialValue(next.defaultValue);
  };

  return (
    <div className="probe-controls">
      <h2>Probes</h2>

      <div className="control-row">
        <input
          type="number"
          step={5000}
          value={range.min}
          onChange={(e) => setRange({ ...range, min: Number(e.target.value) || 0 })}
        />
        <span className="muted">to</span>
        <input
          type="number"
          step={5000}
          value={range.max}
          onChange={(e) => setRange({ ...range, max: Number(e.target.value) || 0 })}
        />
        <button
          className="probe-button inline"
          disabled={isProbing || range.max <= range.min}
          onClick={() => void runSweep(range, "human").catch(() => {})}
        >
          sweep
        </button>
      </div>

      <div className="control-row">
        <select value={program} onChange={(e) => setProgram(e.target.value)}>
          {PROGRAM_SLUGS.map((slug) => (
            <option key={slug} value={slug}>
              {slug}
            </option>
          ))}
        </select>
        <button
          className="probe-button inline"
          disabled={isProbing || !hasSweep}
          onClick={() => void runAblation(program, "human").catch(() => {})}
        >
          ablate
        </button>
      </div>

      <div className="control-row">
        <select value={dialId} onChange={(e) => pickDial(e.target.value)}>
          {POLICY_DIALS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        {dial.isBoolean ? (
          <input
            type="checkbox"
            checked={dialValue === 1}
            onChange={(e) => setDialValue(e.target.checked ? 1 : 0)}
          />
        ) : (
          <input
            type="number"
            step={dial.step}
            min={dial.min}
            max={dial.max}
            value={dialValue}
            onChange={(e) => setDialValue(Number(e.target.value) || dial.defaultValue)}
          />
        )}
        <button
          className="probe-button inline"
          disabled={isProbing}
          onClick={() => {
            const value = dial.isBoolean ? dialValue === 1 : dialValue;
            void runEditPolicy({ [dial.id]: value }, `${dial.id} → ${value}`, "human").catch(() => {});
          }}
        >
          reform
        </button>
      </div>

      <div className="control-row chips">
        {DIFF_PRESETS.filter((p) => p.isAvailable(household)).map((preset) => (
          <button
            key={preset.label}
            className="probe-button inline"
            disabled={isProbing}
            onClick={() =>
              void runDiff(
                { ...household, ...preset.variant(household) },
                preset.label,
                "human",
              ).catch(() => {})
            }
          >
            what if: {preset.label}
          </button>
        ))}
      </div>

      <div className="control-row">
        <input
          type="number"
          step={1000}
          value={pin.x}
          title="earnings point to pin at"
          onChange={(e) => setPin({ ...pin, x: Number(e.target.value) || 0 })}
        />
        <input
          type="text"
          maxLength={120}
          placeholder="pin a note…"
          value={pin.note}
          onChange={(e) => setPin({ ...pin, note: e.target.value })}
        />
        <button
          className="probe-button inline"
          disabled={pin.note.trim().length === 0}
          onClick={() => {
            annotate(pin.x, pin.note.trim(), "human");
            setPin({ ...pin, note: "" });
          }}
        >
          pin
        </button>
      </div>
    </div>
  );
}
