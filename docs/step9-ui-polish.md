# Step 9 (v2) — UI rebuild plan (from Aug 29 full audit)

Rewrites the original step-9 plan after a code-level UX audit + hackathon/judge research.
Scope: presentation layer only. **Feature freeze holds** — no new WebMCP tools, no backend
changes. ChatGPT is the prose layer; the screen's job is numbers, attribution, and legibility.

**Where v1 landed (commits through c27cbb2):** beam canvas (map = ground, blue flow modal +
red reading modal fed by beams), 50/50 vertical split, agent pins/tray/ticker, minimal-fix
progress narration, heatmap ridges + you-dot, partial contrast/aria pass. Tests green
(pytest 17, probe-e2e all tools + presets).

**Why a v2:** the audit found the *mechanical* cause of the "bad whitespace + tiny text"
feel, and that v1's 9.3 (human verbs) was never finished. plan.md says step 9 is
"code done" — the checkboxes below are the truth.

---

## Audit findings that drive this plan (evidence)

1. **Letterboxing is the root cause of both whitespace and tiny text.** Charts are
   fixed-aspect SVGs (`viewBox 1240×320`, aspect 3.875:1) scaled with
   `preserveAspectRatio="…meet"` into containers that are ~5.2:1 at 1280×720:
   - Sweep map renders at ~0.741 scale → **~158px blank margin each side** (~26% of the
     ground region, grows with window width — `.app` has no max-width), axis/you-marker
     text at ~9.6px, cliff badges ~9.3px, pin labels ~8.5px.
   - MoneyFlow (960×440 in a ~557×237 box) renders at ~0.539 scale → program labels
     **~6.7px**, "What your family keeps" ~6.5px, BBCE/gate-chip notes **~5.4px**, and the
     hero net-income number (fontSize 24) lands at **~13px on screen**.
   - Follow-on bugs: tooltips positioned as % of *container* not content
     (`StackedSweepChart.tsx:383`, `HeatmapChart.tsx:165`, `DiffChart.tsx:99`) drift up to
     ~100px at the edges; DiffChart crosshair (`DiffChart.tsx:53-58`) ignores letterboxing
     entirely — up to ~265px off; DiffChart is 860 wide vs the sweep's 1240, so
     sweep→diff silently rescales the whole map.
2. **No type hierarchy.** Largest text in the loaded workbench is 16px (`.explainer h3`);
   floor is 9.5px (voice badges). Nothing owns the screen; the most important figure in
   the app is the smallest-rendered hero number in it.
3. **9.3 was three-quarters done.** `ProbeToolbar.tsx` (301 lines) is orphaned — imported
   by nothing — plus ~70 lines of dead `.toolbar/.tool*` CSS (`App.css:579-648`). Two
   human verbs died un-re-homed: **annotate/pin** (agent-only via `webmcp/tools.ts:608`;
   the green `--human` pin color can literally never render) and **custom sweep range**
   (every human path hardcodes `{min:0, max:100_000}` — `ScenarioLibrary.tsx:21`,
   `HouseholdCard.tsx:85`). After a diff or safety grid there is **no "back to the map"**
   control; recovery depends on the Rail, which returns `null` until ≥2 entries.
4. **Who-did-what history isn't on screen.** Store keeps the full `probeLog`
   (`state/store.ts:50,188`) but the UI renders only `probeLog[0]` as a transient pill.
   Collaboration visibility is a scored criterion.
5. **Cold open is empty.** First paint = scenario cards over ~350px of blank white; the
   workbench (chart/legend/strip) is invisible until a scenario loads.
6. **Chart affordances are thin.** Only worst/selected cliffs get filled pills (rest are
   bare ~9px red text); sweep axes have no titles; DiffChart has no x-labels and no
   you-marker; scrub/pin is hinted by one 12px line; MoneyFlow's inactive $0 rows are
   clickable with zero affordance; `.probe-progress` (top:10px) collides with cliff
   badges (badgeY 12–30); `.ticker { bottom:78px }` lands mid-plot.

**Judge lens:** Nahas reads `tools.ts` (already strong). Drasner (Chrome, SVG-animation
author) judges this exact canvas — letterboxed, misaligned SVG is what she catches.
Rushing judges inside ChatGPT desktop's narrow browser. Grigorik: perf (101 kB gz is fine).
Criteria are equally weighted: Leverage / Execution / Impact / Creativity.

---

## 9A. Scale system — charts fill their boxes (ROOT CAUSE — do first)

Goal: no letterboxing anywhere; SVG text renders ≥11px effective at 1280×720.

- [x] **Adaptive viewBox** for `StackedSweepChart` (Aug 29): new `viz/useFittedBox.ts` —
      `useFittedHeight` measures the svg box (ResizeObserver + the ≤1000px media query,
      where the stacked layout's `height:auto` would chase its own tail) and derives the
      viewBox height (clamp 220–560) so scale ≈ 1.0. `xMidYMax` kept; `contentBox()`
      helper kept for the clamped edge cases. `CHART_GEOM` now exports `{W, M}`;
      `ConnectorLayer` reads the live height off `viewBox.baseVal` + re-measures next
      frame after mount/resize.
- [x] `MoneyFlow` (Aug 29): rebuilt at **scale exactly 1** — `useMeasuredBox` sets the
      viewBox to the CSS box, horizontal anchors derive from real width, vertical budget
      reserves for inactive rows + tax outflow then gives the rest to ribbons. Labels now
      render at 11–12px real (were ~5.4–6.7px); net number 21px in-SVG (HTML hero lands
      in 9B). Anti-jitter preserved: viewBox depends only on box size.
- [x] `DiffChart` (Aug 29): W 860→1240, margins matched to the sweep, adaptive height,
      crosshair mapped through content coordinates, y-ticks 11→13px.
- [x] `HeatmapChart` (Aug 29): adaptive height via the same hook.
- [x] **Tooltips**: with letterboxing gone, the container-percentage positioning is
      correct on all three charts (drift only returns in the clamped <220px-height edge
      case — accepted); the diff pointer math was the real bug and is fixed.
- [x] `.app { max-width: 1560px; margin: 0 auto }`.
- [x] Collisions: `.probe-progress` moved to bottom-center (`bottom:44px`, clear of the
      badge band); `.ticker` anchored to the legend row (`bottom:2px`).

Status: code done Aug 29 — tsc clean, vite build 103 kB gz, probe-e2e green (all tools +
6 presets). **User verified by hand (screenshot): map fills the space, type legible.**
Feedback: still cluttered → 9A.1.

## 9A.1 De-clutter (from the user's screenshot review)

- [x] **Beams → hairline spines** (`ConnectorLayer.tsx`): the wide translucent bodies
      crossed into a big X mid-screen; now just the 1.5px curved spine at 0.45 opacity.
- [x] **Cliff badges hug the curve** (`StackedSweepChart.tsx`): pills sit ~26px above
      their own drop point (short stems, quiet sky) and stack upward when neighbors crowd
      within 84px; M.top 46→40.
- [x] **Ticker re-homed** into the toolbar row's empty left side (in-flow pill, no more
      overlaying the legend); `App.tsx` + `.ticker` CSS.
- [x] **What-if strip anchored**: quiet bordered pill container instead of chips floating
      in whitespace.
- [x] **Spine connection restored** (user: "connection between the modals and the graph
      isn't as good" after the body removal): each spine now leaves the card at the point
      of its bottom edge nearest the root (clamped, 24px corner inset) instead of the
      center — a drop, not a screen-wide sweep — at 2px/0.5 opacity with a filled dot
      where it lands on the map.
- [x] MoneyFlow "What your family keeps" label was clipping at the card edge → two
      stacked lines that fit the reserved right column.

**Gate:** at 1280×720 and at ChatGPT-desktop width, zero blank side-margins on the map;
smallest rendered text anywhere ≥11px (verify by measuring, not eyeballing); tooltips and
crosshairs track the pointer exactly at both edges. tsc + probe-e2e green.

## 9B. Hierarchy — one number owns the screen

- [x] **Hero readout** (Aug 29): 42px tabular-nums HTML number in the flow card header —
      net-kept at the cursor income, accent-blue while scrubbing off-home; the in-SVG
      21px duplicate became a quiet 12px label. `App.tsx` (`netAtCursor` via
      `interpolate`), `.hero-keep/.hero-num/.hero-sub`.
- [x] Type scale vars added to `index.css` (`--fs-xs…--fs-hero`); floor pass done: every
      sub-12px informational size raised (voice badges 9.5→10.5 as decorative-uppercase
      exception, member labels 10→11, disclaimer/provenance/fine-print 11→12, t-sub,
      thumb titles, eyebrows). Full sweep of remaining literals onto the vars is
      opportunistic, not blocking.
- [x] Axis titles on the sweep map ("yearly earnings →" / "what your family keeps ↑",
      heatmap pattern).
- [x] All cliff badges are pills: selected = solid fill, worst = heavier ring + darker
      tint, rest = light tint.
- [x] DiffChart: x tick labels, blue you-marker (same language as the sweep), and a
      `.diff-summary` line above the chart — gap at the household's earnings + flip
      points ("flips at $41k") or "ahead/behind across the whole range".
- [x] MoneyFlow: `<title>` + existing hover style on inactive $0 rows; Newsreader kept to
      its deliberate role (scenario questions + headline accents).
- [x] Cliff headline in the reading card 15→18px (start of the card-hierarchy pass).

**Gate:** screenshot at 1280×720 — a stranger can state the family's net income and the
worst cliff within 5 seconds; nothing informational below 12px effective.

## 9C. Human parity — finish v1's 9.3

- [x] **Pin a note** (Aug 29): "📍 pin a note" in the probe strip opens an inline input;
      pins at the cursor/pinned income (falls back to household earnings) via
      `annotate(x, note, "human")` — the green human pin is finally reachable.
- [x] **Zoom the map** (Aug 29): "zoom the map" in the strip opens min/max inputs
      (clamped $0–$200k, ≥$5k span) → `runSweep` with a custom range; a
      "reset $0–$100k" chip appears whenever the active sweep is zoomed.
- [x] **Back to the map** (Aug 29): diff and safety-grid views now carry a neutral
      `.view-banner` naming the view with a "back to the map" button
      (`setView({mode:"sweep"})`), matching the ablate/reform banner pattern.
- [x] **Rail from the first entry** (was ≥2); voice badges raised to 10.5px in the floor
      pass. (History beyond 12 thumbs: skipped — MAX_GALLERY is enough for a session.)
- [x] `ProbeToolbar.tsx` deleted (301 lines) + dead CSS: `.toolbar/.tool*`, `.headline`,
      `.cliff-readout`, `.hint`, `.foot-row`, `.activity`, `.probe-controls`. Verified by
      grep first — `.probe-button`, `.control-row`, `.fine-print`, `.pulse` are live and
      kept.

**Gate:** the full probe vocabulary is reachable by hand with labeled controls (sweep/zoom,
what-if, ablate, dial, grid, pin); a first-time viewer can name every verb in ~10s; human
pin renders green on the map; probe-e2e still green (no tool contract changes).

## 9D. Cold open — first paint is the mountain range

- [ ] Auto-load the flagship "Weighing a raise" preset on mount (backend-warm path):
      first paint = full sweep with cliff pills + you-marker within ~3s.
- [ ] Scenario cards overlay/stack on top of the loaded map (compact strip or dismissible
      panel), still discoverable; `webmcpAvailable === false` hint kept.
- [ ] Cold-start banner ("waking the benefits engine…") remains for slow backend.

**Gate:** fresh incognito load (warm backend) shows the chart in ~3s with scenarios still
one click away; empty-state whitespace gone.

## 9E. Re-verify in the judged environment + rehearse (carry-over)

- [ ] ChatGPT desktop re-verify of the new layout (9A–9D change geometry; the narrow-width
      stacking + scroll-into-view behavior must be re-checked there, not just in Chrome).
- [ ] Lighthouse perf + a11y ≥ 90 on the deployed URL; contrast spot-check anything that
      moved; SVG cliff pills keep their roles/keyboard access.
- [ ] Demo-arc rehearsal ×2 in ChatGPT desktop. Script rules: opening line says **"we're
      already on childcare assistance (CCAP)"** (or start from "Weighing a raise");
      script the ~2 sensitive-data confirmation prompts as natural beats.
- [ ] Video/README: say the agent-native design out loud (probe verbs, compact JSON,
      `readOnlyHint`, `human_did_meanwhile`, `get_workbench`). Never "look, cliffs
      visualized" — CliffWatch exists.
- [ ] Then plan.md Step 10 (deploy, README, video, Devpost).

**Gate:** two clean end-to-end rehearsals, tests green, freeze everything.

---

## Explicitly out of scope (unchanged from v1)

- No scrollytelling / self-narrating explainer widgets — the agent is the prose layer.
- No new WebMCP tools, no backend/API changes, no new chart types.
- No dark mode (light-committed is a decision, not a gap).
- Post-deadline ideas parked: focus+context zoom brush, "line blossoms into Sankey"
  animation, adaptive-viewBox niceties beyond what 9A needs.

## Order & rationale

9A before everything (every visual decision depends on a sane scale system) → 9B (the
hierarchy is what makes it "intuitive, simple, focused on understanding") → 9C (makes the
collaboration visible — a scored criterion) → 9D (ten-second wow for cold judges) → 9E
(the judged environment is ChatGPT desktop, not a Chrome tab). 9A+9B land together in one
visually-reviewable pass if possible; each phase commits at its gate.
