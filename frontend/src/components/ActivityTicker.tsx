/**
 * Who did what, visibly: the latest probe (agent or human) floats briefly
 * over the map's top-right corner, color-tagged by actor. Keyed by entry id
 * so each new probe replays the highlight animation. The snapshots tray
 * holds the history; this is the live attribution.
 */

import { usePeiraStore } from "../state/store";

export function ActivityTicker() {
  const latest = usePeiraStore((s) => s.probeLog[0]);
  const isProbing = usePeiraStore((s) => s.isProbing);
  if (!latest) return null;
  return (
    <div className="ticker" key={latest.id} role="status">
      <span className={`pulse ${latest.source}${isProbing ? " live" : ""}`} />
      <span className={`ticker-who ${latest.source}`}>
        {latest.source === "agent" ? "Agent" : "You"}
      </span>
      <span className="ticker-summary">{latest.summary}</span>
    </div>
  );
}
