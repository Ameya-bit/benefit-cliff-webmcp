/**
 * The human's probe verbs, always in reach: a slim vertical toolbar on the
 * right edge (CrashAI/Neuronpedia-style). Each verb opens a small popover
 * with just that probe's controls — the same runProbes functions the
 * agent's WebMCP tools call, with source: "human". The toolbar makes the
 * shared vocabulary visible: what the agent can do, you can do.
 */

import { useEffect, useRef, useState } from "react";
import {
  annotate,
  runAblation,
  runDiff,
  runEditPolicy,
  runSweep,
  runSweep2D,
} from "../probes/runProbes";
import { usePeiraStore } from "../state/store";
import { DIFF_PRESETS, POLICY_DIALS } from "../probes/uiPresets";
import { programLabel } from "../viz/palette";
import { PROGRAM_SLUGS } from "../webmcp/tools";

type Verb = "sweep" | "compare" | "ablate" | "dial" | "map2d" | "pin";

const VERBS: { id: Verb; glyph: string; label: string; title: string }[] = [
  { id: "sweep", glyph: "∿", label: "map", title: "Map income — how everything changes as earnings rise" },
  { id: "compare", glyph: "⇄", label: "what if", title: "Compare a life change against today" },
  { id: "ablate", glyph: "⊘", label: "remove", title: "Remove a program to see what depends on it" },
  { id: "dial", glyph: "◔", label: "dial", title: "Change a policy rule and re-run the map" },
  { id: "map2d", glyph: "▦", label: "grid", title: "Earnings × childcare-cost safety map" },
  { id: "pin", glyph: "⚑", label: "pin", title: "Pin a note on the map" },
];

export function ProbeToolbar() {
  const isProbing = usePeiraStore((s) => s.isProbing);
  const hasSweep = usePeiraStore((s) => s.sweep !== null);
  const household = usePeiraStore((s) => s.household);

  const [open, setOpen] = useState<Verb | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [range, setRange] = useState({ min: 0, max: 100_000 });
  const [program, setProgram] = useState<string>(PROGRAM_SLUGS[0]);
  const [dialId, setDialId] = useState(POLICY_DIALS[0].id);
  const [dialValue, setDialValue] = useState<number>(POLICY_DIALS[0].defaultValue);
  const [grid, setGrid] = useState({ maxEarnings: 100_000, maxChildcare: 30_000 });
  const [pin, setPin] = useState({ x: 80_000, note: "" });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dial = POLICY_DIALS.find((d) => d.id === dialId)!;
  const pickDial = (id: string) => {
    setDialId(id);
    setDialValue(POLICY_DIALS.find((d) => d.id === id)!.defaultValue);
  };
  const run = (work: Promise<unknown>) => {
    setOpen(null);
    void work.catch(() => {});
  };

  const needsSweep = (verb: Verb) => verb === "ablate" || verb === "pin";

  return (
    <div className="toolbar" ref={wrapRef}>
      {VERBS.map((verb) => (
        <button
          key={verb.id}
          className={`tool${open === verb.id ? " open" : ""}`}
          title={verb.title}
          disabled={needsSweep(verb.id) && !hasSweep}
          aria-expanded={open === verb.id}
          onClick={() => setOpen(open === verb.id ? null : verb.id)}
        >
          <span className="tool-glyph" aria-hidden="true">{verb.glyph}</span>
          <span className="tool-label">{verb.label}</span>
        </button>
      ))}

      {open && (
        <div className="tool-pop" style={{ top: 8 + VERBS.findIndex((v) => v.id === open) * 52 }}>
          {open === "sweep" && (
            <>
              <div className="eyebrow">Map income</div>
              <div className="control-row">
                <input
                  type="number"
                  step={5000}
                  value={range.min}
                  aria-label="from earnings"
                  onChange={(e) => setRange({ ...range, min: Number(e.target.value) || 0 })}
                />
                <span className="muted">to</span>
                <input
                  type="number"
                  step={5000}
                  value={range.max}
                  aria-label="to earnings"
                  onChange={(e) => setRange({ ...range, max: Number(e.target.value) || 0 })}
                />
              </div>
              <button
                className="btn"
                disabled={isProbing || range.max <= range.min}
                onClick={() => run(runSweep(range, "human"))}
              >
                Map this range
              </button>
              <p className="tool-hint">A narrower range zooms in around a cliff.</p>
            </>
          )}

          {open === "compare" && (
            <>
              <div className="eyebrow">What if…</div>
              {DIFF_PRESETS.filter((p) => p.isAvailable(household)).map((preset) => (
                <button
                  key={preset.label}
                  className="btn"
                  disabled={isProbing}
                  onClick={() =>
                    run(
                      runDiff(
                        { ...household, ...preset.variant(household) },
                        preset.label,
                        "human",
                      ),
                    )
                  }
                >
                  {preset.label}
                </button>
              ))}
              <p className="tool-hint">Overlays the changed life against today’s.</p>
            </>
          )}

          {open === "ablate" && (
            <>
              <div className="eyebrow">Remove a program</div>
              <div className="control-row">
                <select value={program} onChange={(e) => setProgram(e.target.value)} aria-label="program">
                  {PROGRAM_SLUGS.map((slug) => (
                    <option key={slug} value={slug}>
                      {programLabel(slug)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn"
                disabled={isProbing || !hasSweep}
                onClick={() => run(runAblation(program, "human"))}
              >
                See what depends on it
              </button>
            </>
          )}

          {open === "dial" && (
            <>
              <div className="eyebrow">Change a rule</div>
              <div className="control-row">
                <select value={dialId} onChange={(e) => pickDial(e.target.value)} aria-label="policy dial">
                  {POLICY_DIALS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="control-row">
                {dial.isBoolean ? (
                  <label className="subsidy-row">
                    <input
                      type="checkbox"
                      checked={dialValue === 1}
                      onChange={(e) => setDialValue(e.target.checked ? 1 : 0)}
                    />
                    on
                  </label>
                ) : (
                  <input
                    type="number"
                    step={dial.step}
                    min={dial.min}
                    max={dial.max}
                    value={dialValue}
                    aria-label="dial value"
                    onChange={(e) => setDialValue(Number(e.target.value) || dial.defaultValue)}
                  />
                )}
              </div>
              <button
                className="btn"
                disabled={isProbing}
                title="Rebuilds the rules (~5s) and re-runs the map"
                onClick={() => {
                  const value = dial.isBoolean ? dialValue === 1 : dialValue;
                  run(runEditPolicy({ [dial.id]: value }, `${dial.label} → ${value}`, "human"));
                }}
              >
                Re-run under this rule
              </button>
            </>
          )}

          {open === "map2d" && (
            <>
              <div className="eyebrow">Safety grid</div>
              <div className="control-row">
                <input
                  type="number"
                  step={10_000}
                  value={grid.maxEarnings}
                  aria-label="max earnings"
                  title="earnings up to"
                  onChange={(e) => setGrid({ ...grid, maxEarnings: Number(e.target.value) || 100_000 })}
                />
                <span className="muted">×</span>
                <input
                  type="number"
                  step={5_000}
                  value={grid.maxChildcare}
                  aria-label="max childcare cost"
                  title="childcare cost up to"
                  onChange={(e) => setGrid({ ...grid, maxChildcare: Number(e.target.value) || 30_000 })}
                />
              </div>
              <button
                className="btn"
                disabled={isProbing}
                onClick={() =>
                  run(
                    runSweep2D(
                      { variable: "employment_income", min: 0, max: grid.maxEarnings, count: 41 },
                      { variable: "pre_subsidy_childcare_expenses", min: 0, max: grid.maxChildcare, count: 21 },
                      "human",
                    ),
                  )
                }
              >
                Map earnings × childcare
              </button>
              <p className="tool-hint">Cliffs appear as ridges; flat bright regions are safe.</p>
            </>
          )}

          {open === "pin" && (
            <>
              <div className="eyebrow">Pin a note</div>
              <div className="control-row">
                <input
                  type="number"
                  step={1000}
                  value={pin.x}
                  aria-label="earnings point"
                  title="earnings point to pin at"
                  onChange={(e) => setPin({ ...pin, x: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="control-row">
                <input
                  type="text"
                  maxLength={120}
                  placeholder="what did you find?"
                  value={pin.note}
                  onChange={(e) => setPin({ ...pin, note: e.target.value })}
                />
              </div>
              <button
                className="btn"
                disabled={pin.note.trim().length === 0}
                onClick={() => {
                  annotate(pin.x, pin.note.trim(), "human");
                  setPin({ ...pin, note: "" });
                  setOpen(null);
                }}
              >
                Pin it
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
