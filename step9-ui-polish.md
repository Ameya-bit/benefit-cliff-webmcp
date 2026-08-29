# Step 9 — UI polish plan (from Aug 29 UI assessment)

Scope: presentation layer only. **Feature freeze holds** — no new WebMCP tools, no backend
changes, no scrollytelling/explainer machinery. ChatGPT is the prose layer; the job here is
to make the existing machinery bigger, louder, and legible in the judged environment.

Judging criteria this plan serves: execution, quality of the human-agent experience,
usefulness. Work the steps **in order** — 9.0 is a blocker-class risk gate; do it first.

---

## 9.0 Verify the judged viewport (BLOCKER — do before any polish)

Judges open the live URL in **ChatGPT desktop's in-app browser**, which is much narrower
than a desktop tab. The three-region layout (header bar / Sankey + stage / fixed right
panel + edge toolbar) has never been verified there.

- [x] **Chrome simulation done (Aug 29, tested at 1000 / 800 / 640px):** the layout does
      NOT break — no horizontal overflow at any width, the header wraps to two lines,
      the Sankey scales, and a breakpoint already stacks the reading panel full-width
      below the stage. Two real defects found:
      1. **Reading panel lands below the fold when stacked** — clicking a cliff at narrow
         width writes the explanation off-screen with zero visible feedback. Fix: on the
         stacked breakpoint, scroll the panel into view on selection (or make it a bottom
         sheet).
      2. **The floating icon toolbar overlays the stage** at narrow widths — at 800px it
         sits on top of the heatmap's right edge / "$100k" axis label. Resolved for free
         by 9.3 (dissolving the toolbar); until then it needs a reserved gutter.
      Also noted: at ≤800px the header disclaimer disappears, and the sweep chart + cliff
      pills get very small — reinforces 9.1.
- [x] Confirmed in **actual ChatGPT desktop** (Aug 29, by hand): both defects reproduce
      there too. Deferred as acceptable for now — defect 2 still resolves via 9.3, and
      defect 1 (scroll-into-view on selection) stays on the list below.
- [x] Stacked breakpoint: reading panel now scrolls into view on selection
      (`ExplainerPanel.tsx` effect, ≤1000px only, respects prefers-reduced-motion).
      Verified at 900px: clicking a cliff pill auto-scrolls the explanation on screen.
- [x] Phone check (Aug 29): page degrades fine EXCEPT the household sentence, which
      wrapped one-word-per-line into a full-screen header. **Fixed:** at ≤640px the
      sentence condenses into a person-icon chip ("👤 $50,000") that opens the same
      editor popover, now pinned full-width under the header (`HouseholdBar.tsx`,
      `App.css`); full summary preserved for screen readers via aria-label. Verified in
      Chrome at ~600px: one-line header, editor opens/closes, no horizontal overflow.

**Gate:** the full demo arc is usable and legible inside ChatGPT desktop's browser at its
actual width. Do not proceed past this gate on assumptions.

---

## 9.1 Invert the hierarchy — the sweep chart is the hero

Today the Sankey (static view) owns the top ~60% and the sweep chart (the product) is
squeezed into the bottom third with ~10px axis text. Flip it.

- [x] `App.tsx` / `App.css`: grid inverted (Aug 29) — row 1 is now rail + stage (hero,
      chart max-width 1120px) beside the reading panel; the Sankey moved to a secondary
      "How the money flows" strip below (max 880px / 48vh). Narrow (≤1000px) order:
      chart → money flow → reading panel.
- [x] Base type raised: body 13→15px; content sizes bumped across App.css (headline
      13→17, explainer 12.5→14, legend 10.5→12, buttons 11→12.5, scenario cards,
      tooltips, readouts, rail, footer all up 1–2px).
- [x] `StackedSweepChart.tsx`: taller canvas (290→330), axis labels 10→11.5 in
      ink-secondary, net line 1.5→2.2, cliff pills 54×15→62×18 with text 9.5→11.
- [x] "You are here" is now a real marker: stronger blue line + white-ringed dot
      anchored on the net-income line + halo label "you — $50k".
- [x] StageHeadline kept at the top of the hero, raised to 17px.

**Gate:** verified in-browser Aug 29 (fold at ~1500×690 and 900px): pills, axis,
"you — $50k", headline, legend all readable; cliff selection + reading panel land
above the fold on desktop. tsc clean.

---

## 9.1b Linked slice — the money flow follows the line (DONE Aug 29)

Direction decided with the user after 9.1: the sweep is the base canvas
(overview), and the Sankey is the *detail at the cursor* — the vertical slice of
the map at one income. This resolves the "sweep appears out of nowhere" problem
by making the two views one object. References that ground the pattern:
overview + detail-on-demand (Shneiderman), Engaging Data's tax-brackets slider
(engaging-data.com/tax-brackets), NYT rent-vs-buy, d3 Focus+Context
(observablehq.com/@d3/focus-context), explorabl.es reactive documents.

- [x] `MoneyFlow.tsx` re-derives from the sweep at `currentIndex` (falls back to
      household earnings) — pure client-side, zero backend calls while scrubbing.
      viewBox height fixed at 440 so the figure doesn't jitter through cliffs.
- [x] `StackedSweepChart.tsx`: click on the plot **pins** the cursor (solid line +
      "viewing $85k · click to release"); pointer-leave falls back to the pin, else
      home. Cliff-badge clicks stopPropagation so they don't pin. Pin resets on new
      sweep. Canvas taller (330→380).
- [x] `App.tsx` money-flow header is live: "at the line on the map — $85,000"
      (accent blue) while the cursor is off-home; hint line "slide or click on the
      map above to look at any income"; chart hint mentions pinning.
- [x] Verified end-to-end: pin at $85k → Sankey shows job $85k, all programs $0
      but CTC $2,200, taxes −$24.5k; release → hover-follow; leave → back to $50k.

Still queued from this concept: ghost example household as the cold-open base
image (fold into 9.6); "line blossoms open into the Sankey" animation and a
focus+context zoom brush are POST-DEADLINE polish, not in scope.

---

## 9.1c Anchored beams — the map is the ground of the page (DONE Aug 29)

User's vision, scoped to "anchored, not floating": the full-width map sits at
the bottom as the base reality; detail cards sit above it, each visibly rooted
to the income it describes by a beam that widens as it rises (the "opens up
into an ellipse" idea as a docked shape — cards stay put, only roots move).

- [x] Layout (`App.tsx` / `App.css`): `.detail-zone` on top (flow card +
      explainer card, both bordered 12px-radius cards), `.map-zone` below with
      the rail + full-width chart. `.main` is now flex column + position:relative.
- [x] `StackedSweepChart.tsx`: wide flat viewBox 1240×330 (fills the page width
      at ~1:1 scale), in-chart type raised to page scale (axis 13, badges 12.5,
      pills 72×21), $10k x-ticks, y-tick density guard. Exports `CHART_GEOM`.
- [x] New `viz/ConnectorLayer.tsx`: DOM-measured SVG overlay (pointer-events
      none) drawing two beams — blue from the cursor/you-line root up into
      `.flow-card`, cliff-red from the selected cliff root up into `.explainer`.
      Soft widening body (0.07 fill) + curved spine (0.35). Re-measures on store
      changes + ResizeObserver; hides itself when the sweep chart isn't on stage
      (diff/heatmap) and via CSS at ≤1000px (cards stack, scroll-into-view
      covers selection feedback).
- [x] Verified: load scenario → blue beam at $50k; select $29k cliff → red beam
      into the reading card; pin $85k → blue beam sweeps right + Sankey morphs;
      release → home. Narrow 900px: no overflow, connector hidden. tsc clean.

Known minor: beams pass behind the stage headline text (light tint, readable);
heatmap/diff modes have no beams (acceptable — they are view-swaps).

---

## 9.1d Ground-up rebuild: map strip + blue modal (DONE Aug 29)

User direction: blank slate. The map is a full-width strip at the bottom
(~⅓ of the screen) carrying ONLY axis numbers + legend; the you/cursor line
grows upward into a widening beam that connects to a blue modal holding the
Sankey — line, beam, and modal share one blue so they read as one object.

- [x] Removed for now (to be re-introduced as anchored elements later):
      StageHeadline (deleted), "Explored so far" rail (component kept, not
      rendered), ExplainerPanel (component kept, not rendered), chart hint
      text + CliffReadout (deleted). NOTE: cliff pills still select (agent
      tracing targets it) but selection currently has NO visible surface —
      restoring that is part of bringing the reading panel back.
- [x] Chart flattened to 1240×250 (M.top 46, two badge rows), fills width.
- [x] `.flow-card` is now the blue modal: rgba(37,99,235,.06) bg + .28 border;
      beam body fill matches the card alpha for continuity; beam curve changed
      to a monotone funnel (controls at 35%/45% of the drop — the mid-height
      S-curve ballooned on short spans); CARD_SEG 120 / ROOT_W 22.
- [x] Verified: rest state is one clean screen (modal → beam → you-line → map
      → legend); pin at $83k sweeps the beam across and morphs the Sankey.

Next when re-adding panels: reading panel returns as a second anchored modal
(cliff-red, fed by its own beam — ConnectorLayer already supports it via the
`.explainer` selector); rail returns as snapshots, placement TBD.

---

## 9.1e Everything re-homed on the beam canvas (DONE Aug 29, commit f26ef1e)

- [x] **Reading modal** (right half, cliff-red + red beam): headline sentence
      with recovery, per-program deltas, rule-that-binds block FIRST (was below
      the modal's internal fold), **policy dial inline** on the binding rule —
      the healing finale verified by hand (0.85 → 1.08 heals the CCAP cliffs,
      mode banner + back-to-current-law work). Quiet borderless hint when
      nothing is selected. Bugfix: selecting a different cliff clears a stale
      trace (old rule/dimming used to bleed in).
- [x] **Snapshots tray**: horizontal thumb tray above the map (appears at 2+
      entries), one-line truncated titles; restore verified.
- [x] **Probe strip** above the map, right side: what-if chips + safety grid.
      Ablate ("what if it were gone?") + dial live in the reading modal.
      POLICY_DIALS/DIFF_PRESETS shared in probes/uiPresets.ts.
- [x] **Activity ticker** (9.2 partial): latest probe floats in the map's
      quiet lower-right, actor-colored, animates per entry.
- [x] **Provenance line** (9.6 partial) under the legend; no-agent hint copy
      updated in ScenarioLibrary + ExplainerPanel.
- [x] Verified: tsc, vite build (101 kB gz), probe-e2e green (all tools +
      6 presets), manual arc select→trace→dial-heal→restore→what-if→tray.

Still open from the master list: diff/heatmap visual pass on this canvas,
annotation-pin styling + snapshot who-tags polish (rest of 9.2), chart aria +
contrast audit (9.6), cold-open ghost household (9.6), ChatGPT-desktop
re-verify of the new layout, demo rehearsal (9.7). SVG cliff pills are not in
the a11y tree — add roles/keyboard access in the 9.6 pass.

---

## 9.2 Make the collaboration visible (scored criterion)

A viewer watching the demo must be able to say who did what without being told.

- [ ] **Action ticker**: when a probe lands, show a transient but readable line near the
      stage — "Agent mapped your income $0–$100k → found 7 cliffs" / "You removed
      Cash aid (TANF)". Source it from the existing `probeLog` (store.ts); the footer
      `ActivityLine` can stay as the persistent version, but the ticker must be seen
      without looking at the footer. Color-code by `--agent` / `--human`.
- [ ] **Annotation pins**: confirm `AnnotationPins.tsx` renders `annotate` results on the
      chart in the agent's visual identity; if it's wired but invisible, style it up
      (pin + short label). This is the lab-notebook-on-canvas moment.
- [ ] **Rail → readable cards** (`Rail.tsx`): keep the thumbnails but add a legible line
      per entry: who + verb + headline number ("Agent · without TANF · SNAP −$5,139").
      Bump the "· agent / · you" tag from 9px decoration to a real colored badge.

**Gate:** screen-record one agent probe + one human probe; a naive viewer can narrate
who did what from the recording alone.

---

## 9.3 Dissolve the mystery toolbar into labeled contextual actions

The right-edge icon rail (MAP / WHAT IF / REMOVE / DIAL / GRID / PIN) hides the product's
originality behind grey 9px icons. Same disease as the old cliff badges (plan.md lesson).

- [ ] WHAT IF presets ("+ partner", "kids 3yrs older", "off childcare assistance") →
      labeled chips near the household bar or under the chart: "What if… [+ partner]…".
- [ ] DIAL (change a rule) → move into the ExplainerPanel "rule that binds" block, next to
      the existing policy-dial note (the panel already does contextual verbs right —
      "What if it were gone?" is the pattern to copy).
- [ ] MAP / GRID → labeled buttons at the stage header ("Map my income" / "Map earnings ×
      childcare"), not icons.
- [ ] PIN / REMOVE: PIN moves next to the chart; REMOVE (ablate) already exists
      contextually in ExplainerPanel — dedupe.
- [ ] Delete or radically simplify `ProbeToolbar.tsx` once verbs are re-homed.

**Gate:** a first-time viewer can find and name every probe verb within ~10 seconds of
looking at the loaded workbench. No unlabeled icons remain.

---

## 9.4 Motion as explanation + latency theater (the video's spine)

- [ ] Ablation: animate the layer collapsing and dependent layers shifting (slow, causal
      easing — watchable, not a swap). `useAnimatedMatrix.ts` is the hook point.
- [ ] Cliff healing (`edit_policy` / `find_minimal_fix` result): morph baseline → reformed
      curve; dashed current-law ghost stays. This transition IS the finale — budget real
      time on its easing.
- [ ] **Minimal-fix progress narration**: the finale takes ~a minute. `isProbing` must show
      live progress ("testing ccap_exit_smi_rate 0.90… 0.95…") — stream whatever the
      backend exposes, or fake determinate progress from the known search sequence in
      `runProbes.ts`. A silent minute kills the demo.
- [ ] Respect `prefers-reduced-motion` (cheap: gate durations on the media query).

**Gate:** record ablate → restore → minimal-fix; transitions read as cause-and-effect and
the minimal-fix wait is narrated throughout.

---

## 9.5 Heatmap: annotate it or cut it

The 41×21 blue field currently shows no ridges, no "you", jargon caption.

- [ ] Either invest: emphasize cliff ridges as drawn lines, drop a "you are here" dot at
      (household earnings, current childcare cost), label the safe region in words, and
      rewrite the caption in plain language ("darker = your family keeps less").
- [ ] Or: keep the tool for the agent but drop GRID from the human UI and the demo arc.
- [ ] Decide within one work session — do not let this eat the schedule.

**Gate:** if kept, a viewer can point at the safe zone and their own position unprompted.

---

## 9.6 Trust, a11y, and cold-open

- [ ] **Provenance line** (visible, not fine-print): "Computed with policyengine-us 1.821.4 ·
      Colorado rules · 2026" near the stage or footer. Judges spot-check dramatic numbers.
- [ ] **Actionable next step**: make the MyFriendBen + official-program links more prominent
      in the cliff explanation — every cliff ends with "what you can actually do."
      This is the usefulness story.
- [ ] **Contrast pass**: nothing informational below WCAG AA (the #999-on-white 10px text
      fails today). Audience framing makes this pointed.
- [ ] **Chart aria**: aria-labels on the stage summarizing the current view ("Income map
      $0–$100k, 7 cliffs, worst at $29k costing $8,492"), buttons already semantic.
- [ ] **Cold-open in plain Chrome**: auto-load the flagship "Weighing a raise" sweep so
      first paint is the mountain range with cliff pills; scenario cards overlay/stack on
      top of it. Ten-second wow with no agent. Keep the `webmcpAvailable === false` hint.

**Gate:** Lighthouse a11y ≥ 90; fresh incognito load shows the chart within ~3s
(backend warm) with scenario cards still discoverable.

---

## 9.7 Freeze, rehearse, ship prep

- [ ] Re-run existing checks: `cd backend && uv run pytest tests/` and
      `cd frontend && npx tsx scripts/probe-e2e.ts` (UI changes must not break tool paths).
- [ ] Update plan.md PROGRESS (mark Step 9, link this file).
- [ ] Demo-arc rehearsal ×2 in ChatGPT desktop (carry-over from Step 8). Remember the
      script rules: opening line says **"we're already on childcare assistance (CCAP)"**
      (or start from the "Weighing a raise" preset), and script the ~2 sensitive-data
      confirmation prompts as natural beats.
- [ ] In the video + README, say the agent-native design out loud: probe verbs
      (trace/ablate/diff/heal), compact JSON results, `readOnlyHint`,
      `human_did_meanwhile`, `get_workbench`. Pitch discipline: lead with what only the
      agent loop can do — never "look, cliffs visualized" (CliffWatch exists).
- [ ] Then proceed to plan.md Step 10 (deploy Render + Netlify, README, video, Devpost).

**Gate:** two clean rehearsals end-to-end, tests green, freeze everything.

---

## Explicitly out of scope (do not drift)

- No Ciechanowski-style scrollytelling or self-narrating explainer widgets — the agent is
  the prose layer; self-explaining graphics undermine "better together."
- No new WebMCP tools, no backend/API changes, no new chart types.
- No dark mode (light-committed is a decision, not a gap).
- Steal from Ciechanowski only: instant manipulability (have it), causal motion (9.4),
  and at most one tiny inline diagram in the reading panel (income vs. binding threshold
  mini-gauge) — only if 9.1–9.4 are done with time to spare.
