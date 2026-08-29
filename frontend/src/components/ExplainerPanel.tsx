/**
 * The reading modal: contextual explanation of whatever is selected — a
 * program stream (clicked in the money flow), the selected cliff, or the
 * live trace. It docks in the right half of the detail zone, in cliff-red,
 * fed by its own beam from the selected cliff's spot on the map (the
 * ConnectorLayer finds it by the `.explainer` class). Plain language, real
 * links, and the probe verbs attached to the object they act on — ablate on
 * the program, the policy dial on the binding rule.
 */

import { useEffect, useRef, useState } from "react";
import { cliffRecovery, interpolate } from "../probes/analysis";
import { runAblation, runEditPolicy, runMinimalFix, runTrace } from "../probes/runProbes";
import { usePeiraStore } from "../state/store";
import type { EditableParameter } from "../types";
import { POLICY_DIALS } from "../probes/uiPresets";
import { PROGRAM_INFO } from "../viz/programInfo";
import { programColor, programLabel } from "../viz/palette";

const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/** Inline control for the whitelisted rule bound at the traced cliff. */
function DialControl({ param }: { param: EditableParameter }) {
  const isProbing = usePeiraStore((s) => s.isProbing);
  const dial = POLICY_DIALS.find((d) => d.id === param.id);
  const [value, setValue] = useState<number>(
    typeof param.current_value === "boolean"
      ? param.current_value
        ? 1
        : 0
      : param.current_value,
  );
  if (!dial) return null;
  const run = () => {
    const v = dial.isBoolean ? value === 1 : value;
    void runEditPolicy({ [dial.id]: v }, `${dial.label} → ${v}`, "human").catch(() => {});
  };
  return (
    <div className="control-row">
      {dial.isBoolean ? (
        <label className="subsidy-row">
          <input
            type="checkbox"
            checked={value === 1}
            onChange={(e) => setValue(e.target.checked ? 1 : 0)}
          />{" "}
          on
        </label>
      ) : (
        <input
          type="number"
          step={dial.step}
          min={dial.min}
          max={dial.max}
          value={value}
          aria-label="rule value"
          onChange={(e) => setValue(Number(e.target.value) || dial.defaultValue)}
        />
      )}
      <button
        className="btn"
        disabled={isProbing}
        title="Rebuilds the rules (~5s) and re-runs the map"
        onClick={run}
      >
        re-run under this rule
      </button>
    </div>
  );
}

export function ExplainerPanel() {
  const sweep = usePeiraStore((s) => s.sweep);
  const household = usePeiraStore((s) => s.household);
  const trace = usePeiraStore((s) => s.trace);
  const selectedCliff = usePeiraStore((s) => s.selectedCliff);
  const focusProgram = usePeiraStore((s) => s.focusProgram);
  const isProbing = usePeiraStore((s) => s.isProbing);
  const webmcpAvailable = usePeiraStore((s) => s.webmcpAvailable);

  const earnings = household.adults.reduce((a, ad) => a + ad.employment_income, 0);

  // What to explain: explicit focus > live trace > selected cliff. Nothing
  // selected = an honest empty state, not a default program.
  const slug =
    focusProgram ??
    trace?.dominant_program ??
    selectedCliff?.dominant_program ??
    null;

  // On narrow screens the panel stacks below the stage; a selection made up
  // on the chart would otherwise respond entirely off-screen.
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!slug) return;
    if (!window.matchMedia("(max-width: 1000px)").matches) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    asideRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [slug, selectedCliff]);

  if (!slug) {
    // Nothing selected: a quiet hint in the open right half, not a modal.
    return (
      <div className="explainer-empty">
        <p>
          Click a money stream on the flow, or a{" "}
          <span className="cliff-hint">▼ cliff</span> on the map, and it gets
          explained here in plain language — what the program is, what it pays
          your family, and the exact rule behind it.
        </p>
        {webmcpAvailable === false && (
          <p className="agent-hint">
            No agent is attached. Open this page in ChatGPT’s browser to
            explore by conversation — or explore by hand: scrub the map, click
            cliffs, and use the what-if buttons.
          </p>
        )}
      </div>
    );
  }

  const info = PROGRAM_INFO[slug];
  const label = programLabel(slug);
  const color = programColor(slug);

  const forYou =
    sweep && sweep.programs[slug]
      ? interpolate(
          sweep.x,
          sweep.programs[slug],
          Math.max(sweep.x[0], Math.min(earnings, sweep.x[sweep.x.length - 1])),
        )
      : null;

  const traceMatches = trace && trace.dominant_program === slug;
  const rule = traceMatches ? trace.binding_rules[0] : null;

  return (
    <aside className="explainer" ref={asideRef}>
      {selectedCliff && (
        <div className="cliff-block">
          <div className="eyebrow cliff-eyebrow">Selected cliff</div>
          <p className="cliff-headline">
            Crossing <b>{fmt(selectedCliff.from_x)}</b> costs this family{" "}
            <b className="neg">{fmt(Math.abs(selectedCliff.net_drop))}</b>{" "}
            <span className="serif-it">in one step</span>.
            {(() => {
              const recovery = sweep
                ? cliffRecovery(sweep.x, sweep.net_income, selectedCliff)
                : null;
              return recovery ? <> Not fully recovered until {fmt(recovery)}.</> : null;
            })()}
          </p>
          <div className="delta-list">
            {Object.entries(selectedCliff.program_deltas)
              .filter(([, v]) => Math.abs(v) > 1)
              .sort(([, a], [, b]) => a - b)
              .map(([deltaSlug, v]) => (
                <div key={deltaSlug} className="tt-row">
                  <span className="swatch" style={{ background: programColor(deltaSlug) }} />
                  {programLabel(deltaSlug)}{" "}
                  <b className={v < 0 ? "neg" : "pos"}>{fmt(v)}</b>
                </div>
              ))}
          </div>
          <div className="btn-row">
            <button
              className="btn"
              disabled={isProbing}
              onClick={() => void runTrace(selectedCliff.from_x, "human").catch(() => {})}
            >
              Why does this happen?
            </button>
            <button
              className="btn"
              disabled={isProbing}
              title="Searches for the smallest rule change that removes this cliff (takes ~a minute)"
              onClick={() => void runMinimalFix(selectedCliff.from_x, "human").catch(() => {})}
            >
              Could a rule change fix it?
            </button>
          </div>
        </div>
      )}

      {rule && (
        <div className="rule-block" style={{ borderColor: color }}>
          <div className="eyebrow" style={{ color }}>The rule that binds here</div>
          <p>
            {rule.rule}
            {typeof rule.before === "number" && typeof rule.after === "number" && (
              <>
                {" "}
                — <span className="tabular">{fmt(rule.before)} → {fmt(rule.after)}</span>
              </>
            )}
          </p>
          {rule.editable_parameter && (
            <>
              <p className="dial-note">
                Policy dial: {rule.editable_parameter.label} — currently{" "}
                {String(rule.editable_parameter.current_value)}. Test moving it:
              </p>
              <DialControl
                key={rule.editable_parameter.id}
                param={rule.editable_parameter}
              />
            </>
          )}
        </div>
      )}

      <div>
        <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="swatch" style={{ background: color }} /> Program
        </div>
        <h3>{label}</h3>
        {info && <div className="official-name">{info.official}</div>}
      </div>

      {info && <p>{info.blurb}</p>}

      {forYou !== null && (
        <p>
          For your family right now: <b>{forYou > 1 ? `${fmt(forYou)}/yr` : "nothing at this income"}</b>.
        </p>
      )}

      {info && (
        <div className="links">
          <a href={info.linkHref} target="_blank" rel="noopener noreferrer">
            Official info — {info.linkLabel} ↗
          </a>
          <a href="https://co.myfriendben.org" target="_blank" rel="noopener noreferrer">
            Everything you may qualify for — MyFriendBen ↗
          </a>
        </div>
      )}

      <div className="btn-row">
        <button
          className="btn"
          disabled={isProbing || !sweep}
          title="Re-runs the map with this program removed, to see what depends on it"
          onClick={() => void runAblation(slug, "human").catch(() => {})}
        >
          What if it were gone?
        </button>
      </div>

      {webmcpAvailable === false && (
        <p className="agent-hint">
          No agent is attached. Open this page in ChatGPT’s browser to explore
          by conversation — everything here works by hand too.
        </p>
      )}

      <p className="fine-print">
        Model estimates from policyengine-us — not benefits advice.
      </p>
    </aside>
  );
}
