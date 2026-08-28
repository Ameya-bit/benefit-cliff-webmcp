/**
 * Bench status strips: backend warm-up state and the last probe failure.
 * The engine imports a 600MB rules model at boot (~15s locally, longer on a
 * cold cloud instance) — visitors need to know probes will unlock, not
 * conclude the site is broken.
 */

import { useEffect, useState } from "react";
import { API_BASE } from "../config";
import { usePeiraStore } from "../state/store";

const HEALTH_POLL_MS = 4_000;
const SLOW_BOOT_POLLS = 10;

type EngineStatus = "checking" | "warm" | "down";

function useEngineStatus(): EngineStatus {
  const [status, setStatus] = useState<EngineStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      polls += 1;
      try {
        const response = await fetch(`${API_BASE}/health`);
        const body = (await response.json()) as { data?: { status?: string } };
        if (cancelled) return;
        if (body.data?.status === "warm") {
          setStatus("warm");
          return; // stop polling once warm
        }
      } catch {
        if (cancelled) return;
      }
      setStatus(polls >= SLOW_BOOT_POLLS ? "down" : "checking");
      timer = setTimeout(() => void check(), HEALTH_POLL_MS);
    };

    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return status;
}

export function StatusBanners() {
  const engine = useEngineStatus();
  const probeError = usePeiraStore((s) => s.probeError);
  const setProbeError = usePeiraStore((s) => s.setProbeError);

  return (
    <>
      {engine === "checking" && (
        <div className="status-banner warming">
          Waking up the benefits engine — probes unlock in a few seconds…
        </div>
      )}
      {engine === "down" && (
        <div className="status-banner down">
          The benefits engine isn&rsquo;t responding. If you&rsquo;re running
          locally: <code>cd backend && uv run uvicorn app.main:app</code>
        </div>
      )}
      {probeError && (
        <div className="status-banner error">
          <span>probe failed: {probeError}</span>
          <button
            className="banner-dismiss"
            aria-label="dismiss error"
            onClick={() => setProbeError(null)}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
