/**
 * Intro panel shown while the canvas is empty. Presets are the on-ramp:
 * one click fills the household card, logs a human set_household, and runs
 * the opening sweep — so cold visitors (with or without an agent) land on a
 * live chart instead of a blank screen.
 */

import { useState } from "react";
import { SCENARIO_PRESETS, type ScenarioPreset } from "../presets";
import { runSweep } from "../probes/runProbes";
import { usePeiraStore } from "../state/store";
import { HouseholdCard } from "./HouseholdCard";

function applyPreset(preset: ScenarioPreset) {
  const store = usePeiraStore.getState();
  store.setHousehold(preset.household);
  store.logProbe({
    source: "human",
    tool: "set_household",
    summary: `preset: ${preset.label}`,
  });
  void runSweep({ min: 0, max: 100_000 }, "human").catch(() => {
    // probing() already surfaced the error on the bench.
  });
}

export function ScenarioLibrary() {
  const isProbing = usePeiraStore((s) => s.isProbing);
  const webmcpAvailable = usePeiraStore((s) => s.webmcpAvailable);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  const copyQuestion = async (preset: ScenarioPreset) => {
    try {
      await navigator.clipboard.writeText(preset.question);
      setCopiedLabel(preset.label);
      setTimeout(() => setCopiedLabel(null), 1_500);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context) — the
      // question text is visible on the card either way.
    }
  };

  return (
    <div className="scenario-library">
      <h2>Start with a family like yours.</h2>
      <p className="scenario-sub">
        Every card is a real Colorado situation — load one, then ask what a
        raise would do. Each card&rsquo;s question is a good opener for the
        agent.
      </p>
      <div className="scenario-grid">
        {SCENARIO_PRESETS.map((preset) => (
          <div className="scenario-card" key={preset.label}>
            <h3>{preset.label}</h3>
            <p className="muted small">{preset.blurb}</p>
            <p className="scenario-question">&ldquo;{preset.question}&rdquo;</p>
            <div className="scenario-actions">
              <button
                className="probe-button inline"
                disabled={isProbing}
                onClick={() => applyPreset(preset)}
              >
                load scenario
              </button>
              <button
                className="probe-button inline"
                onClick={() => void copyQuestion(preset)}
              >
                {copiedLabel === preset.label ? "copied!" : "copy question"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="own-family">
        <div className="own-family-intro">
          <h3 className="own-family-title">or describe your own family</h3>
          <p className="muted small">
            Fill in the card and apply — the map draws what every income
            between $0 and $100k would mean for you.
          </p>
        </div>
        <HouseholdCard />
      </div>
      {webmcpAvailable === false && (
        <p className="agent-hint">
          No agent is attached to this page. Open it in ChatGPT&rsquo;s
          browser (or Chrome with the WebMCP flag) to let an agent run the
          probes — or load a scenario and explore by hand: scrub the map,
          click cliffs, try the what-if buttons.
        </p>
      )}
      <p className="fine-print">
        Estimates from a computer model of Colorado&rsquo;s 2026 rules
        (policyengine-us) — not official benefits advice. Check with your
        caseworker before acting on anything here.
      </p>
    </div>
  );
}
