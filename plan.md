# Plan: Benefits Cliff Probe — agent-native instrument for the US benefits system

Submission for the OpenAI WebMCP Challenge (deadline Sep 3, 2026, 1 p.m. PT).
This is a **step-by-step build plan**, not a schedule. Each step has a verification gate — do not move on until it passes.

---

## 0. Decisions (researched, recommended — flag before Step 1 if you disagree)

### State: **Colorado**
Verified locally against `policyengine-us 1.821.4` (single parent, one child age 3, $15k/yr childcare expenses, health benefits included in net income):

| Earnings crossing | Net income change | Cause |
|---|---|---|
| $5k → $6k | **−$2,289** | CO TANF exit |
| $29k → $30k | **−$8,362** | Adult Medicaid loss (−$13,066, partly offset by ACA PTC) |
| $31k → $32k | **−$6,450** | Child Medicaid → CHIP |
| $50k → $51k | **−$13,006** | CO CCAP childcare subsidy cliff (−$15,000 at once) |

Colorado has *everything* fully modeled in policyengine-us: CCCAP (full CCDF model), TANF, SNAP with BBCE (200% FPL gross limit via `is_tanf_non_cash_eligible` — this powers the ablation demo), Medicaid/CHIP, state EITC **and** state CTC. Four dramatic cliffs on one sweep is the demo.

**NY and CA were tested head-to-head (Aug 28) and rejected:**
- **CA**: its only modeled childcare subsidy is CalWORKs child care (welfare-to-work families on TANF) — `ca_child_care_subsidies` returns **$0** for a working non-TANF family. No childcare cliff at all → no centerpiece for trace/ablate/heal. CHIP also returns $0. Remaining cliffs are milder than CO's.
- **NY**: has a spectacular Medicaid cliff (−$17,352 net at $29k→$30k) and a CHIP cliff at $87k, *but* the NY CCAP childcare model pays **$0 even for a fully eligible household** — after supplying every schedule input it needs (`weekly_hours_worked_before_lsr`, `childcare_hours_per_day`, `childcare_days_per_week`), eligibility and market rate ($17.7k) both come back positive yet `ny_ccap` still computes $0. Looks like an upstream model wiring quirk we can't afford to debug. NY's sweep also shows an *unattributable* cliff at $54k→$55k (no tracked program explains it) — poison for a demo whose whole thesis is attribution.
- **Population ≠ impact for judging**: the "Potential Impact" criterion asks for a credible case, not the demo state's TAM. The instrument is state-parameterized by design — CO is the launch wedge, the README states the generalization. And correct numbers in CO beat broken numbers in NY: judges can spot-check. (If a populous state becomes a hard requirement, Illinois/NJ/Ohio are on the full-CCDF-model list and could be tested the same way — but CO is the only state verified end-to-end.)
- Extra input requirements discovered for household schemas: childcare needs `childcare_hours_per_week` **and** (for some states) `childcare_hours_per_day` + `childcare_days_per_week` on the child, and `weekly_hours_worked_before_lsr` on the parent for activity tests. Bake all four into `set_household` regardless of state.

### Programs (7 layers on the chart)
SNAP, Medicaid/CHIP, CCCAP childcare subsidy, TANF, EITC (fed+CO), CTC (fed+CO), ACA premium tax credit. All verified present.

### Engine hosting: **self-host `policyengine-us` behind FastAPI on a persistent server — Render, 2GB instance** (decided)
- Why self-host is faster (it's not the network hop — that's identical): the win is what sits *behind* the hop. PolicyEngine's hosted API rebuilds reformed systems per request (35.7s measured), shares traffic, and has no endpoints for our trace/ablate logic at all. Our own warm process caches reformed systems, serves sweeps in ~1.5s, and is exclusively ours during judging. ($50 credit: **claimed** ✔)
- **Render** wins on the numbers: challenge participants get a $50 credit; a Standard 2GB instance is ~$25/mo, so the credit covers boot-through-judging (must stay live until ~Sep 23) at $0 out of pocket. Render is also a challenge partner (a Render prize is in the pool). Fallback: Fly.io (~$11/mo, no credit).
- Ruled out: **GitHub Pages** (static only — cannot run Python; GitHub Pro adds no compute), **Vercel functions** (615MB venv + 5s import + 1.2GB RSS don't fit serverless), **Google Cloud Run** (works but an always-warm 2GB min-instance costs more than Render-with-credit and adds setup friction for zero judge value).
- Frontend is static and free everywhere; **Netlify free tier** is plenty (credits not even needed). GitHub Pages would also work but Netlify co-runs the challenge and has a judge — equal effort, better placement.
- Traffic reality: judges + trickle. One warm 2GB instance with response caching for the preset scenarios is ample; no scaling work warranted.
- Rejected: PolicyEngine hosted APIs. The official household API needs credentials-by-email (schedule risk); the unofficial web-app API took **35.7s** for a reform request (kills the `edit_policy` finale) and has no SLA.
- Self-host measured numbers: 5.1s cold import (pay once at boot), 0.05s to build a baseline `Simulation`, **1.4–1.7s for a 12-variable × 101-point sweep**, ~5s to build a *reformed* Simulation (pay per policy edit — design the UX around it).
- Too big for Lambda zip (615MB venv, ~1.2GB peak RSS) but fine in a container with min-instances=1. No microdata download needed for household sims.

### Frontend: **Vite + React + TypeScript**, static deploy on **Netlify** (co-runs the challenge; a Netlify DE is a judge)
- No SSR need; the app is a single canvas + WebMCP registration. Vite keeps it simple and fast (a web-perf judge will notice load time).
- Viz: hand-rolled **SVG** with `d3-shape`/`d3-scale` for stacked areas + animated path interpolation (`d3-interpolate` or Motion). No chart library — the animation (layers collapsing on ablation, cliff healing on edit) IS the product, and a judge is an SVG-animation expert.

### UI shell: adapt from **CrashAI** (`/Users/ameya/CrashAIEverything/CrashAI/frontend`) — assessed Aug 28
Same stack (React 19 + Vite + TS + Tailwind v4 + Zustand), overlay layout already matches the lab-bench design (absolute full-bleed canvas + fixed glass panels + bottom command bar). Reuse tiers:
- **Lift near-verbatim**: `layouts/AppShell.tsx`; `styles/tokens.css`/`surfaces.css`/`base.css` (glass design system, light+dark, animation utilities); `components/TraceView.tsx` (collapsible tool call/result renderer — this IS the probe log, only its `TOOL_LABELS` constant changes); `SidebarSection`, `EmptyState`, `DraggableCard`, `Sparkline` (dependency-free SVG chart — template for our chart work); `lib/api/client.ts` fetch wrapper + `config.ts`; `ErrorBoundary`, `Toast`, `useBreakpoint`, accessibility store.
- **Lift shell, replace body**: `LeftPanel.tsx` (agent-log drawer + streaming UI; ~30 domain lines to change), `RightPanel.tsx` (panel chrome/bottom-sheet; replace its 8-way content dispatch with our probe-card registry), `CommandBar.tsx` (delete the ~70-line map-shortcut block; keep for standalone/human slash commands).
- **Rewrite using their patterns**: the big analysis cards (`IntelligencePanel`, `CorridorSynthesisCard` — 2,500 LOC of crash-domain types); copy the sticky score header / pill tabs / factor-card / skeleton patterns as ~150 fresh lines.
- **Do NOT port**: all map stacks (deck.gl, MapLibre, react-map-gl, Leaflet ×2), `h3-js`, `pdfmake`, recharts; their SSE agent backend plumbing (our agent is ChatGPT via WebMCP — tool calls arrive in-page, no SSE needed).
- Port cautions: hardcoded pixel offsets (`top-[72px]` etc.) → convert to CSS vars; ad-hoc z-index values → establish a scale first.

### WebMCP integration (from spec research, current Aug 2026)
- API is **`document.modelContext.registerTool(...)`** — the `navigator.modelContext` name is deprecated (Chrome 150+ aliases it with a warning). Use `const mc = document.modelContext ?? navigator.modelContext`.
- ChatGPT Desktop browser: supports **imperative, top-frame registration only** (no declarative form tools, no iframes), GPT-5.6 Sol/Terra models, tools appear automatically as "site tools" — no manifest.
- Chrome debug loop: `chrome://flags/#enable-webmcp-testing` (Chrome 146+); inspect via `await document.modelContext.getTools()` in DevTools console, or the "Model Context Tool Inspector" extension.
- Lifecycle: unregister via `AbortController` signal passed at registration (there is no update-in-place; duplicate names throw `InvalidStateError`). One controller for the app's tool set; abort + re-register if the set changes. Guard against React StrictMode double-registration.
- Return values are JSON-stringified for the model — return **small structured JSON** (cliff list, deltas, decomposition summary), never dump full 101-point arrays into the model context.
- No guaranteed input validation before `execute` runs → validate every input ourselves (zod). Mark read-only tools with `annotations: { readOnlyHint: true }`.
- `localhost` is a secure context — local dev works. Use `webmcp-types` for TS types; conditionally load `@mcp-b/webmcp-polyfill` only if the API is absent (nice for plain-Chrome visitors).

### Licensing / credits
Repo is already AGPL-3.0 — same license as policyengine-us, keep it. README must prominently credit **PolicyEngine** (engine + CliffWatch prior art) and the **Atlanta Fed PRD/CLIFF** tools (they have an MOU to cross-validate — cite it). Pitch discipline: the novelty is the *agent-native probing loop* (ablate/trace/diff/edit), never "look, cliffs visualized" — CliffWatch already does that.

### Name: **Peira** (decided)
From ancient Greek **πεῖρα** — "trial, attempt, experiment, probe." The root of **empirical** (ἐμπειρία, *empeiria* — knowledge from experience/trial) and *experiment* via the same Indo-European root (*per-*, "to try, risk"). It names the method: understanding the benefits mechanism through probes, not explanations. Use the etymology in the README/video intro.

### Interaction model: a shared lab bench, not a document
The collaborative-writing analogy maps like this: their shared doc = our **workbench** — one persistent screen both parties read and write. It has three regions:

1. **Household card** (left): the "specimen under study" — adults, kids+ages, wage/hours, childcare cost, state. Editable by hand AND by the agent (`set_household`). Human corrections are ground truth; the agent reads current card state through its tool results.
2. **Canvas** (center): the stacked-area chart with scrub cursor, cliff badges, overlays, and annotation pins. Both parties act on it: human scrubs/clicks (sets `currentPoint`, selects a cliff), agent draws (sweeps, diffs, ablations) and pins `annotate` notes under its own visual identity.
3. **Probe log** (right): a chronological stack of cards, one per probe run — who ran it (human or agent), what it was, compact result ("sweep 0–100k: 4 cliffs", "trace @ $51k: CCCAP exit-income rule"). This is the session's lab notebook / audit trail, and it's what makes the constrained-tool thesis *visible* on screen.

**Audience: both, led by real decisions.** The pitch and demo lead with real situations (a worker's actual raise/hours decision; a caseworker walking a client through one) because "Potential Impact" is a judged criterion — education via the preset scenario library is the on-ramp for cold visitors, not the headline. UI carries a clear "model estimates, not benefits advice" disclaimer. No accounts, no persistence — a session is ephemeral; state lives in the page.

**A normal session, end to end:**
1. Human opens the site in ChatGPT's browser (or picks a preset scenario). Tools register; an intro panel suggests an opening question.
2. Human describes their life in chat ("single mom in Denver, 3-year-old, $23/hr, daycare $1,300/mo — going full-time worth it?"). Agent calls `set_household`; the card fills in; human fixes anything wrong directly on the card.
3. Agent runs `sweep(employment_income)` → chart draws, cliff badges appear → agent narrates the headline from the compact tool result ("at $51k you'd lose ~$13k at once").
4. Human scrubs to their wage, clicks the cliff badge (shared selection), asks *why*.
5. Agent calls `trace_binding_constraint` → mechanism inspector lights up the CCCAP exit-income rule with the actual threshold → grounded explanation, not model folklore.
6. Human hypothesizes; agent tests: `diff_scenarios` (38 vs 32 hrs, married vs not) overlays curves; `ablate_program` exposes the TANF→SNAP hidden dependency; `sweep_2d` finds the safe income×childcare region no slider UI could.
7. Agent `annotate`s each finding; the probe log accumulates the evidence trail.
8. "Could policy fix this?" → `edit_policy` / `find_minimal_fix` → the cliff heals on screen; final annotation records the minimal fix.
9. End state: the workbench reads as a decision record — what we asked, what the mechanism said, what it means for this family.

**Division of labor (the complementarity test, answered concretely):** the human owns the facts of their life, the hypotheses, direct manipulation, and the judgment call; the agent owns translating intent into probes, multidimensional execution, and rule-grounded narration. Human alone: sliders but no ablations/traces/2D search. Agent alone: no ground truth about the family and no one to judge what matters. The workbench is where the two meet.

---

## 1. Repo scaffold + engine spike

Monorepo layout:

```
/backend        FastAPI + policyengine-us (Python, uv-managed)
/frontend       Vite + React + TS
/frontend/src/webmcp/tools.ts   ← THE judged artifact: all tool defs in one documented file
plan.md  README.md  LICENSE
```

Backend spike (no HTTP yet, just a script):
- Build the Colorado reference household; **bake `gov.simulation.include_health_benefits_in_net_income = true` into the baseline** via Reform at server boot (without it, Medicaid/CHIP/ACA cliffs are invisible in net income — this is the single biggest correctness gotcha). Since reformed builds cost ~5s, investigate caching the reformed `TaxBenefitSystem` object and constructing per-request `Simulation`s from it; fallback is accepting the cost once at boot for baseline.
- Sweep via the `axes` mechanism (one vectorized sim, never a Python loop): `situation["axes"] = [[{"name": "employment_income", "count": 101, "min": 0, "max": 100_000, "period": "2026"}]]`, then `sim.calculate(var, 2026, map_to="household")` for each program variable.
- Childcare inputs go on the **child**: `pre_subsidy_childcare_expenses`, `childcare_hours_per_week` (wrong entity → `SituationParsingError`).

**Verify:** script reproduces all four table-0 cliffs; spot-check the curve shape against CliffWatch (policyengine.org/us/cliffwatch) for the same household. Commit.

## 2. Backend API

Endpoints (thin, stateless; the household lives in frontend state and is sent with each request):
- `POST /calculate` — single household, per-program decomposition + net income.
- `POST /sweep` — axis (`employment_income` | hours | childcare cost), range, count → arrays per program + net income + detected cliffs (`np.diff` on net income, threshold, return `[{at, drop, dominant_program}]`).
- `POST /sweep2d` — two perpendicular axes (outer-list `axes` syntax), coarse grid (~41×41) → net-income matrix for the heatmap.
- `POST /diff` — two situations, same axis → both curves + delta curve + where they diverge.
- `POST /trace` — binding-constraint trace at a point (see Step 6 — hardest custom piece).
- `POST /ablate` — program name → re-run sweep with that program neutralized (`neutralize_variable` structural reform, or zero it via parameter reform) → new curves + which *other* programs changed (the interaction signal).
- `POST /reform` — dict of `{dotted.parameter.path: value}` → reformed sweep. Reform builds cost ~5s: return honestly slow, and cache reformed systems by reform-dict hash (LRU, size ~8) so re-runs are instant.

Cross-cutting: pydantic validation on every input (income caps, count caps ≤ 201, whitelist of sweepable variables and reformable parameter paths — never let the agent pass arbitrary parameter paths); one warm engine process; response envelope `{success, data, error}`.

**Verify:** `pytest` unit tests for each endpoint against the known CO cliff values; `/sweep` p50 < 2s warm.

## 3. Frontend scaffold + first end-to-end WebMCP probe

Get ONE probe working through a real agent before building anything else — this is the highest-risk integration.

- Vite + React + TS app; Zustand (or plain context) store: `{household, activeSweep, overlays, annotations, currentPoint}`.
- `webmcp/tools.ts`: register `set_household` and `sweep` via `document.modelContext ?? navigator.modelContext`, one `AbortController`, zod-validated inputs, JSON-Schema `inputSchema`s written for an LLM reader (descriptions say what the probe *reveals*, not just what it does).
- Tool results: compact JSON summary (e.g. sweep returns cliff list + headline numbers + "rendered on canvas"), while the full arrays go straight into the store → chart. The screen is the shared memory; the tool result is a pointer to it.
- Placeholder chart (unstyled line) just to prove data flow.

**Verify (gate for everything after):**
1. Chrome + `#enable-webmcp-testing`: `getTools()` shows both tools; invoking `sweep` via the Tool Inspector extension renders the curve.
2. ChatGPT desktop browser pointed at the deployed-or-tunneled URL: ask "sweep income for a CO single parent with a 3-year-old and $15k childcare" → chart draws. Commit; deploy a skeleton to Netlify + Fly *now* so the demo environment exists from day one.

## 4. Visualization layer (the product)

- **Stacked area chart**: net resources vs swept axis; layers = market income after tax, then each program in a fixed color identity. Every cliff is visually attributed to the layer that collapses. `d3-shape` stack → SVG paths; animate transitions by interpolating paths (consistent 101-point sampling makes plain `d3-interpolate` sufficient — same-length paths, no flubber needed).
- **Bidirectional canvas**: scrub/click sets `currentPoint` (vertical marker, live decomposition readout); click a detected cliff to select it. Human-set state is readable by the agent (`get`-side of `set_household`/current point included in relevant tool results) — the canvas is shared, not agent-write-only.
- **Cliff badges**: auto-annotate detected cliffs with the drop amount.
- Secondary views (build after the stacked area works, not before): 2D heatmap (canvas-rendered, cliff ridges visible), diff overlay (two curves + shaded delta), mechanism-inspector side panel (lights up on `trace`).
- Scope discipline for this step: **functional and correct, not beautiful.** Working transitions, correct attribution, responsive interaction. Deep visual craft is deliberately deferred to the dedicated polish phase (Step 9) so it builds on frozen functionality.

**Verify:** ablation-style data swap animates without jank (test with hardcoded second dataset); interaction feels instant; every view renders correct data.

## 5. Remaining probe verbs (frontend tools + wiring)

Full vocabulary (target: 7 tools, all in `tools.ts`):

1. `set_household(profile)` — write; returns normalized household + what changed.
2. `sweep(axis, min, max, decompose)` — read-only; renders stacked area; returns cliff list.
3. `sweep_2d(axis_x, axis_y, ranges)` — read-only; renders heatmap; returns ridge summary. (Folded into the vocabulary as the "multidimensional probe a human can't do with sliders" — core complementarity evidence.)
4. `diff_scenarios(change)` — read-only; takes a *delta* to the current household (marriage, +$12k 1099 income, kid turns 6, hours 32→38) so the agent expresses counterfactuals compactly; renders overlay; returns divergence summary.
5. `ablate_program(program)` — read-only compute, renders layer-collapse animation; returns which other programs moved (interaction/dependency signal). Demo ablation: knock out TANF-non-cash → SNAP BBCE dies with it.
6. `trace_binding_constraint(point)` — read-only; lights up mechanism inspector; returns the binding rule.
7. `annotate(point, note)` — write; agent leaves a marked finding on the canvas under an agent identity (distinct visual voice).
8. `edit_policy(parameter, value)` / `find_minimal_fix(cliff_at)` — Step 7.

Anti-patterns enforced: no `get_summary`/`explain` tool, no free-form UI control, no tool that returns the full dataset as text. Each tool description documents *why it exists* — the file is written to be read by the MCP-B creator.

**Verify:** scripted ChatGPT session exercises every verb; each renders correctly and returns ≤ ~1KB JSON.

## 6. `trace_binding_constraint` (hardest custom engineering — timebox it)

policyengine-us doesn't expose "the binding rule" directly. Approach:
- Finite-difference each program at `point ± ε` to find the program(s) driving the local change.
- For the driving program, evaluate a **hand-curated map of gate variables** at both sides of the cliff and report which flipped, with its actual threshold values from the parameter tree. Gate maps per program, e.g.: CCCAP → `co_ccap_eligible`, entry/exit income limits vs countable income; SNAP → `meets_snap_gross_income_test`, `meets_snap_categorical_eligibility`, `is_tanf_non_cash_eligible`, BBCE 200%-FPL limit; Medicaid → MAGI income level vs per-group threshold; EITC/CTC → phase-out rate + threshold (a slope, not a cliff — report as marginal-rate contribution).
- Response: `{program, rule, variable_flipped, threshold, your_value_before/after, parameter_path}` — the `parameter_path` is what makes `edit_policy` discoverable ("the constraint IS an editable parameter" — the loop closes).

Curated for our 7 programs in Colorado only — that's the scope wedge, and it's enough. If a program's trace is too gnarly, its inspector entry says "dominant program: X, drop: $Y" without rule detail — degrade gracefully.

**Verify:** trace at each of the four known cliffs names the correct program and rule.

## 7. `edit_policy` + `find_minimal_fix` (the finale)

- `edit_policy`: whitelist of ~6–10 reformable parameters (CCCAP exit threshold, SNAP BBCE gross limit, Medicaid threshold, phase-out rates…), each with human name, dotted path, bounds. Reform sweep renders as an overlay morphing from baseline — the cliff-healing animation is the money footage.
- `find_minimal_fix(cliff_at)`: backend search over the whitelisted parameter(s) implicated by the trace at that cliff — e.g., bisect the smallest threshold move or phase-out-rate change that brings the post-cliff net-income drop under $0. Keep the search coarse (≤ ~8 reform builds ≈ 40s worst case; stream progress, animate intermediate attempts if latency allows — the searching itself is good theater). Cache aggressively.
- Frame honestly in UI copy: this shows *mechanical* fixes and their cost to this household, not policy advocacy.

**Verify:** healing the $50k CCCAP cliff live in ChatGPT's browser end-to-end in < 60s.

## 8. Scenario library + demo hardening

- Preset households for the non-raise use cases: hours decision (32 vs 38 hrs/wk), marriage penalty, new baby, kid turning 6 (CCCAP age dynamics), +$12k side gig, second earner. Each preset = one `set_household` payload + a suggested opening question, listed on an intro panel (also serves cold visitors who arrive without an agent).
- Empty-state UX: the page must make sense in plain Chrome with no agent — sliders/scrub work standalone (the "human alone" half of the complementarity story), with a banner explaining how to open it in ChatGPT's browser.
- Robustness: agent sends garbage → clear tool errors; double registration; navigation/refresh re-registration; backend cold-start banner.

**Verify:** run the full 3-minute demo arc twice from scratch in ChatGPT's browser without touching the keyboard except as "the human" would.

## 9. Dedicated UI polish pass (functionality frozen)

All probe verbs work, the demo arc runs end-to-end — now make it look world-class. **Feature freeze at the start of this step**: no new tools, no new endpoints, no behavior changes. Every commit in this phase should be visually reviewable and safely revertible.

- **Visual identity**: name/logotype, typography (display face for headlines, tabular-nums mono for figures), color system — program layer colors chosen as a deliberate palette (colorblind-safe, consistent identity per program everywhere: chart layers, legend, inspector, cliff badges), dark theme as the primary look (demo footage pops on dark).
- **Animation craft** (Sarah Drasner will judge this screen): tuned easing and stagger on layer transitions; ablation = layer visibly collapses, others reflow; policy edit = cliff *heals* with a satisfying morph; cliff badges drop in with weight; scrub marker with springy follow; mechanism inspector lights up the binding rule with a directed highlight, not a mere border change. 60fps throughout; honor `prefers-reduced-motion`.
- **Layout & information design**: readable at 1280×720 (video crop), generous whitespace, a decomposition readout that reads like an instrument panel, empty/loading states designed ("recomputing the mechanism…" for the ~5s reform builds), agent annotations styled as a distinct voice (avatar/color) vs human marks.
- **Micro-polish**: hover states, focus rings, number formatting ($ with sign coloring for deltas), favicon/OG image, page title.
- **Performance polish**: bundle audit, font loading strategy, Lighthouse perf > 90 on the deployed URL (a web-perf judge will check).
- Screen-record throughout this phase — the best transition takes become the demo video's b-roll.

**Verify:** side-by-side before/after screen recording of the full demo arc; Lighthouse > 90; reduced-motion mode still legible; someone unfamiliar can identify each program layer and each cliff cause from the screen alone.

## 10. Ship

- **Deploy:** frontend → Netlify; backend → Render 2GB container (claim the $50 participant credit early — capped at 500 claims), min 1 instance warm, CORS locked to the Netlify origin, basic rate limiting. Health-check + keep-warm ping.
- **README:** what it is (instrument-not-calculator framing, mech-interp analogy), the tool vocabulary table with rationale per verb, run instructions (backend + frontend + Chrome flag + ChatGPT), prior-art section crediting PolicyEngine/CliffWatch and Atlanta Fed PRD (+ their cross-validation MOU), AGPL license note. Ensure LICENSE shows in the repo About section.
- **Video (< 3 min, public YouTube, with audio)** — script from the brief's arc: raise → cliff appears → "why?" → trace lights up CCCAP → ablate TANF-non-cash kills SNAP (hidden dependency) → diff on hours/marriage → `find_minimal_fix` heals the cliff. Record in ChatGPT's desktop browser. Cut with margin; upload by Sep 2.
- **Submission (via Devpost, webmcp.devpost.com, by Sep 3 1:00 PM PT):** the text description must explicitly answer the form's four prompts: (1) why this use case fits WebMCP, (2) how it improves the user experience, (3) what humans and agents can accomplish together that wasn't feasible before, (4) the WebMCP implementation approach. Our framing maps 1:1 — write it as such.
- **Judging-period ops (Sep 4–21):** live app must stay up and free for judges the whole window — keep the backend warm through Sep 21, not just launch day. **Post-deadline freeze (official guidance): after Sep 3 1PM PT touch nothing — not the repo, not the live site, not the Devpost entry — until winners are announced (~Sep 23).**
- **Video rules:** no third-party trademarks/copyrighted material (no background music); clear audio narration covering what was built and how WebMCP is used.
- **Submission hygiene:** dated commits throughout (commit at every verify-gate), public repo, live URL tested from a clean machine/account.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| ChatGPT browser quirks (safety review on tool calls, model gating to Sol/Terra) | Step 3 gates on a real ChatGPT end-to-end test in week one; keep Chrome-flag + Tool Inspector as fallback demo environment |
| Reform latency (~5s/build) makes the finale drag | LRU cache of reformed systems; pre-warm the demo's exact reforms; "recomputing the mechanism" animation |
| `trace_binding_constraint` rabbit hole | Timeboxed; curated gate-maps for CO only; graceful degradation to program-level attribution |
| WebMCP API drift before judging | Feature-detect `document.modelContext ?? navigator.modelContext`; polyfill fallback; pin nothing exotic |
| policyengine-us model updates change our verified numbers | Pin the exact package version; assert the four reference cliffs in CI |

## Judging alignment (verified against webmcp.devpost.com, Aug 28)

Four **equally weighted** criteria, after a Stage-One pass/fail viability check (app must actually run for judges):

| Criterion (official wording) | Our answer |
|---|---|
| **WebMCP Leverage** — "thoroughly and skillfully… genuine effort and a working, non-trivial implementation" | 7-verb probe vocabulary with design rationale in `tools.ts`; run Chrome's official **WebMCP evals** (developer.chrome.com/docs/ai/webmcp/evals) against our tools and commit the eval suite — concrete, judge-legible evidence of non-trivial use. Follow the **secure-tools guide** (developer.chrome.com/docs/ai/webmcp/secure-tools) and cite it in tool docs (input validation, readOnlyHint, no free-form control). |
| **Execution** — "complete, coherent product experience — not just a technical proof of concept" | Works standalone in plain Chrome (sliders/scrub), preset scenario library, empty/loading states, the dedicated UI polish phase (Step 9). |
| **Potential Impact** — "credible, specific case for solving a real problem for a real audience" | Lead the README/description with the audience: workforce coaches and caseworkers (Atlanta Fed's CLIFF tools are already deployed through exactly these users — cite it), plus hourly workers making hours/raise decisions. Benefits cliffs are a documented national problem; our verified −$13k Colorado cliff is the demo's proof. This criterion is where a civic-domain entry beats toy demos — make the case explicit, with numbers. |
| **Creativity & Ambition** — "how novel… does it differ from existing concepts" | Differ from BOTH the official showcase apps (3D modeling, collaborative writing, crossword builder, Wandernote itinerary, Duckboard/DuckDB — all creative/productivity toys with no computational engine behind them) AND from prior cliff visualizers (CliffWatch, Atlanta Fed dashboards — no agent, no ablation/trace/edit). The mech-interp probing loop over a real 600MB rules engine is the novelty; say so plainly. |

Additional verified facts folded into the plan:
- Deadline confirmed: **Sep 3, 2026, 1:00 PM PT** (Devpost official rules). Built-during-window requirement: satisfied (repo started Aug 27).
- Chrome DevTools now has a **dedicated WebMCP panel** (developer.chrome.com/docs/devtools/application/webmcp) — use it as the primary debug loop (supersedes the console/`getTools()` method in Step 0 notes).
- The `annotate` tool mirrors the official collaborative-writing showcase pattern (agent acting under its own identity) — an endorsed pattern, keep it.
- Free hosting credits available to participants: Render $50 (backend candidate), Netlify 3,000 credits, Vercel $30. Claim early — capped counts.
- ~3,200 registered participants, top-10 prize structure ($3,000 + credits each) — differentiation matters more than polish parity.

## Decisions log

- **Name: Peira** (decided Aug 28). **State: Colorado** (decided Aug 28 — swappable later if another state verifies as complete; IL/NJ/OH are the candidates to test). **UI: reuse CrashAI shell** (decided Aug 28 — visual language will deviate from CrashAI later, direction TBD in Step 9).

## Open decisions for the user

1. Whether `find_minimal_fix` ships or `edit_policy` alone carries the finale if time runs short.
