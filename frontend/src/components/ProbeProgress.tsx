/**
 * Latency theater for the slow probes: while a reform rebuild or the
 * minimal-fix search runs (seconds to a minute), a pill floats over the map
 * narrating what the engine is doing, with a live elapsed counter — the
 * demo's healing finale must never be a silent wait.
 */

import { useEffect, useState } from "react";
import { usePeiraStore } from "../state/store";

export function ProbeProgress() {
  const isProbing = usePeiraStore((s) => s.isProbing);
  const label = usePeiraStore((s) => s.probingLabel);
  const [elapsed, setElapsed] = useState(0);

  const active = isProbing && label !== null;
  useEffect(() => {
    if (!active) return;
    setElapsed(0);
    const startedAt = Date.now();
    const id = setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [active, label]);

  if (!active) return null;
  return (
    <div className="probe-progress" role="status">
      <span className="pulse working live" />
      <span className="progress-label">{label}</span>
      {elapsed > 0 && <span className="elapsed">{elapsed}s</span>}
    </div>
  );
}
