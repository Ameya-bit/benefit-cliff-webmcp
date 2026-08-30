/**
 * The reading tile: contextual explanation of whatever is selected — a
 * program stream (clicked in the money flow), the selected cliff, or the
 * live trace. With nothing selected it shows the ranked cliff digest
 * instead (never an empty instruction sheet); a selection swaps the same
 * tile to the explanation, fed by a beam from the selected cliff's spot on
 * the map (the ConnectorLayer finds it by the `.explainer` class). Plain
 * language, real links, and the probe verbs attached to the object they act
 * on — ablate on the program, the policy dial on the binding rule, pin-a-note
 * on the cliff card.
 */

import { useEffect, useRef, useState } from "react";
import { cliffRecovery, interpolate } from "../probes/analysis";
import { annotate, runAblation, runEditPolicy, runMinimalFix, runTrace } from "../probes/runProbes";
import { usePeiraStore } from "../state/store";
import type { DiffResult, EditableParameter } from "../types";
import { POLICY_DIALS } from "../probes/uiPresets";
import { PROGRAM_INFO } from "../viz/programInfo";
import { BASE_LAYER, PROGRAM_LAYERS, programColor, programLabel } from "../viz/palette";

const fmt = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const fmtK = (v: number) =>
  Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;

/** Default tile content: the ranked cliff digest — the panel is never an
 * empty instruction sheet. Clicking a row selects that cliff and jumps the
 * map cursor to it. */
function CliffDigest() {
  const sweep = usePeiraStore((s) => s.sweep);
  const selectCliff = usePeiraStore((s) => s.selectCliff);
  const setCurrentIndex = usePeiraStore((s) => s.setCurrentIndex);
  const setHoverCliffX = usePeiraStore((s) => s.setHoverCliffX);
  const webmcpAvailable = usePeiraStore((s) => s.webmcpAvailable);

  // The map's hover highlight must not outlive the list (e.g. a row was
  // hovered when clicking swapped this panel to the explanation).
  useEffect(() => () => setHoverCliffX(null), [setHoverCliffX]);

  const cliffs = [...(sweep?.cliffs ?? [])].sort((a, b) => a.net_drop - b.net_drop);
  const worstDrop = cliffs[0]?.net_drop ?? 0;

  return (
    <>
      <div className="sec-head">
        <span className="eyebrow cliff-eyebrow">Raises that backfire</span>
        <span className="at">
          {cliffs.length > 0
            ? `${cliffs.length} on this map, biggest first`
            : "none on this map"}
        </span>
      </div>
      {cliffs.length > 0 ? (
        <div className="cliff-digest">
          {cliffs.map((cliff) => (
            <button
              key={cliff.from_x}
              className={`digest-row${cliff.net_drop === worstDrop ? " worst" : ""}`}
              onMouseEnter={() => setHoverCliffX(cliff.from_x)}
              onMouseLeave={() => setHoverCliffX(null)}
              onFocus={() => setHoverCliffX(cliff.from_x)}
              onBlur={() => setHoverCliffX(null)}
              onClick={() => {
                selectCliff(cliff, "human");
                if (sweep) {
                  const idx = sweep.x.indexOf(cliff.from_x);
                  if (idx >= 0) setCurrentIndex(idx);
                }
              }}
            >
              <span className="digest-drop">▼ {fmtK(Math.abs(cliff.net_drop))}</span>
              <span className="digest-at">at {fmtK(cliff.from_x)}</span>
              <span className="digest-prog">{programLabel(cliff.dominant_program)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="digest-hint">
          No spot on this map where a raise costs your family money — every
          extra dollar earned keeps at least part of itself.
        </p>
      )}
      <p className="digest-hint">
        Click a cliff here or on the map — or a money stream on the flow — and
        it gets explained in plain language: what the program is, what it pays
        your family, and the exact rule behind it.
      </p>
      {webmcpAvailable === false && (
        <p className="agent-hint">
          No agent is attached. Open this page in ChatGPT’s browser to explore
          by conversation — everything here works by hand too.
        </p>
      )}
    </>
  );
}

/** What-if mode: instead of one life's cliffs, the tile says what the
 * change does — the gain or loss, and each program's before → after, at the
 * cursor income (or this household's earnings at rest); plus which cliffs
 * appear or disappear. */
function DiffDigest({ label, diff }: { label: string; diff: DiffResult }) {
  const earnings = usePeiraStore((s) =>
    s.household.adults.reduce((a, ad) => a + ad.employment_income, 0),
  );
  const currentIndex = usePeiraStore((s) => s.currentIndex);
  const setCurrentIndex = usePeiraStore((s) => s.setCurrentIndex);
  const setHoverCliffX = usePeiraStore((s) => s.setHoverCliffX);
  const xs = diff.a.x;

  // The map's hover highlight must not outlive this list.
  useEffect(() => () => setHoverCliffX(null), [setHoverCliffX]);

  // The two sweeps share axis STEPS but not dollar values (+ partner shifts
  // every household total by their income), so everything here — cursor,
  // program values, cliff comparison — is aligned by index on today's map.
  const idxOf = (sweepXs: number[], v: number) =>
    sweepXs.reduce(
      (best, xv, i) => (Math.abs(xv - v) < Math.abs(sweepXs[best] - v) ? i : best),
      0,
    );
  const youIdx = idxOf(xs, Math.max(xs[0], Math.min(earnings, xs[xs.length - 1])));
  const atIdx = currentIndex !== null && currentIndex < xs.length ? currentIndex : youIdx;
  const onCursor = atIdx !== youIdx;
  const deltaAt = diff.net_income_delta[atIdx];

  // The specifics: what each program pays in the two lives at this income —
  // plus pay after taxes (a partner's paycheck, joint filing), so the rows
  // add up to the headline instead of mysteriously disagreeing with it.
  const baseAt = (side: typeof diff.a, i: number) =>
    side.net_income[i] -
    PROGRAM_LAYERS.reduce((acc, l) => acc + (side.programs[l.slug]?.[i] ?? 0), 0);
  const changes = [
    ...PROGRAM_LAYERS.map((layer) => ({
      slug: layer.slug,
      label: layer.label,
      color: layer.color,
      before: diff.a.programs[layer.slug]?.[atIdx] ?? 0,
      after: diff.b.programs[layer.slug]?.[atIdx] ?? 0,
    })),
    {
      slug: "__base",
      label: BASE_LAYER.label,
      color: BASE_LAYER.color,
      before: baseAt(diff.a, atIdx),
      after: baseAt(diff.b, atIdx),
    },
  ]
    .map((p) => ({ ...p, delta: p.after - p.before }))
    .filter((p) => Math.abs(p.delta) > 1)
    .sort((p, q) => p.delta - q.delta);

  const aIdx = diff.a.cliffs.map((c) => idxOf(diff.a.x, c.from_x));
  const bIdx = diff.b.cliffs.map((c) => idxOf(diff.b.x, c.from_x));
  const near = (i: number, list: number[]) => list.some((j) => Math.abs(i - j) <= 1);
  const gone = diff.a.cliffs
    .map((cliff, i) => ({ cliff, idx: aIdx[i] }))
    .filter(({ idx }) => !near(idx, bIdx));
  const added = diff.b.cliffs
    .map((cliff, i) => ({ cliff, idx: Math.min(bIdx[i], xs.length - 1) }))
    .filter((_, i) => !near(bIdx[i], aIdx));
  const kept = diff.b.cliffs.length - added.length;

  const rowProps = (idx: number) => ({
    onMouseEnter: () => setHoverCliffX(xs[idx]),
    onMouseLeave: () => setHoverCliffX(null),
    onFocus: () => setHoverCliffX(xs[idx]),
    onBlur: () => setHoverCliffX(null),
    onClick: () => setCurrentIndex(idx),
    title: "Highlights this cliff on the map — click to look at that income",
  });

  return (
    <>
      <div className="sec-head">
        <span className="eyebrow">What changes</span>
        <span className="at">with {label}</span>
      </div>
      <p className="cliff-headline">
        At{" "}
        {onCursor ? (
          <>
            the line — <b className="tabular cursor-inc">{fmt(xs[atIdx])}</b>
          </>
        ) : (
          <>
            your <b className="tabular">{fmt(xs[atIdx])}</b>
          </>
        )}
        , {label} means{" "}
        <b className={deltaAt < 0 ? "neg" : "pos"}>
          {deltaAt < 0 ? "−" : "+"}
          {fmt(Math.abs(deltaAt))}
        </b>{" "}
        a year.
      </p>
      {changes.length > 0 ? (
        <div className="delta-list diff-programs">
          {changes.map((p) => (
            <div key={p.slug} className="tt-row">
              <span className="swatch" style={{ background: p.color }} />
              {p.label}
              <span className="delta-vals tabular">
                {p.before < 1 ? "$0" : fmt(p.before)} →{" "}
                {p.after < 1 ? "gone" : fmt(p.after)}
              </span>
              <b className={p.delta < 0 ? "neg" : "pos"}>
                {p.delta < 0 ? "−" : "+"}
                {fmt(Math.abs(p.delta))}
              </b>
            </div>
          ))}
          <div className="tt-row diff-total">
            <span className="swatch" style={{ visibility: "hidden" }} />
            together
            <b className={deltaAt < 0 ? "neg" : "pos"}>
              {deltaAt < 0 ? "−" : "+"}
              {fmt(Math.abs(deltaAt))}
            </b>
          </div>
        </div>
      ) : (
        <p className="digest-hint">Nothing changes at this income.</p>
      )}
      <div className="cliff-digest">
        {gone.map(({ cliff, idx }) => (
          <button key={`gone-${cliff.from_x}`} className="digest-row" {...rowProps(idx)}>
            <span className="digest-gone">✓ gone</span>
            <span className="digest-at">
              ▼ {fmtK(Math.abs(cliff.net_drop))} at {fmtK(xs[idx])}
            </span>
            <span className="digest-prog">{programLabel(cliff.dominant_program)}</span>
          </button>
        ))}
        {added.map(({ cliff, idx }) => (
          <button key={`new-${cliff.from_x}`} className="digest-row worst" {...rowProps(idx)}>
            <span className="digest-drop">▼ new: {fmtK(Math.abs(cliff.net_drop))}</span>
            <span className="digest-at">at {fmtK(xs[idx])}</span>
            <span className="digest-prog">{programLabel(cliff.dominant_program)}</span>
          </button>
        ))}
        {gone.length === 0 && added.length === 0 && (
          <p className="digest-hint">No cliff appears or disappears with this change.</p>
        )}
      </div>
      <p className="digest-hint">
        {kept > 0 &&
          `${kept} cliff${kept === 1 ? "" : "s"} stay${kept === 1 ? "s" : ""} either way. `}
        The dashed line on the map is life with {label}; the money flow below
        shows that life at the cursor.
      </p>
    </>
  );
}

/** "📍 pin a note" inside the cliff card: annotation lives with its object. */
function PinNote({ at }: { at: number }) {
  const isProbing = usePeiraStore((s) => s.isProbing);
  const [text, setText] = useState<string | null>(null);

  if (text === null)
    return (
      <button
        className="btn"
        disabled={isProbing}
        title={`Leave a note on the map at ${fmtK(at)}`}
        onClick={() => setText("")}
      >
        📍 pin a note
      </button>
    );

  const submit = () => {
    if (text.trim().length === 0) return;
    annotate(at, text.trim(), "human");
    setText(null);
  };
  return (
    <span className="note-form">
      <input
        className="note-input"
        type="text"
        maxLength={80}
        placeholder={`note at ${fmtK(at)}…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoFocus
        aria-label={`note pinned at ${fmtK(at)}`}
      />
      <button className="btn" onClick={submit}>
        pin
      </button>
      <button className="btn" aria-label="cancel note" onClick={() => setText(null)}>
        ×
      </button>
    </span>
  );
}

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
  const selectCliff = usePeiraStore((s) => s.selectCliff);
  const view = usePeiraStore((s) => s.view);
  const focusProgram = usePeiraStore((s) => s.focusProgram);
  const setFocusProgram = usePeiraStore((s) => s.setFocusProgram);
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
    // Nothing selected: never an empty panel — the ranked cliff digest, or
    // in a what-if, the comparison digest.
    return (
      <aside className="tile explainer" ref={asideRef}>
        {view.mode === "diff" ? (
          <DiffDigest label={view.label} diff={view.diff} />
        ) : (
          <CliffDigest />
        )}
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
    <aside className="tile explainer" ref={asideRef}>
      <button
        className="btn digest-clear"
        title="Back to the list of cliffs on this map"
        onClick={() => {
          selectCliff(null, "human");
          setFocusProgram(null);
        }}
      >
        ← all cliffs
      </button>
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
            <PinNote at={selectedCliff.from_x} />
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
