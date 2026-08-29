/**
 * The right panel: quiet, contextual explanation of whatever is selected —
 * a program stream (clicked in the money flow), the selected cliff, or the
 * live trace. Plain language, real links, and the human's probe verbs
 * attached to the object they act on. The full probe controls sit below
 * behind a disclosure for the power user.
 */

import { useEffect, useRef } from "react";
import { interpolate } from "../probes/analysis";
import { runAblation, runMinimalFix, runTrace } from "../probes/runProbes";
import { usePeiraStore } from "../state/store";
import { PROGRAM_INFO } from "../viz/programInfo";
import { programColor, programLabel } from "../viz/palette";

const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

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
    return (
      <aside className="explainer">
        <div>
          <div className="eyebrow">Reading panel</div>
          <h3>Nothing selected</h3>
        </div>
        <p>
          Click a money stream on the flow, or a <span className="cliff-hint">▼ cliff</span> on
          the map, and it gets explained here in plain language — what the
          program is, what it pays your family, and the exact rule behind it.
        </p>
        {webmcpAvailable === false && (
          <p className="agent-hint">
            No agent is attached. Open this page in ChatGPT’s browser to explore
            by conversation — or drive every probe yourself with the toolbar on
            the right.
          </p>
        )}
        <p className="fine-print">
          Model estimates from policyengine-us — not benefits advice.
        </p>
      </aside>
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
          <p>
            Crossing <b>{fmt(selectedCliff.from_x)}</b> drops what this family
            keeps by <b className="neg">{fmt(Math.abs(selectedCliff.net_drop))}</b> — mostly{" "}
            {programLabel(selectedCliff.dominant_program)}.
          </p>
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
            <p className="dial-note">
              Policy dial: <code>{rule.editable_parameter.id}</code> ={" "}
              {String(rule.editable_parameter.current_value)} — the agent (or you,
              below) can test moving it.
            </p>
          )}
        </div>
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
          No agent is attached. Open this page in ChatGPT’s browser to explore by
          conversation — or drive every probe yourself with the toolbar on the
          right.
        </p>
      )}

      <p className="fine-print">
        Model estimates from policyengine-us — not benefits advice.
      </p>
    </aside>
  );
}
