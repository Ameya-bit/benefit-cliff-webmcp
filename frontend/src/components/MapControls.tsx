/**
 * On-map controls, in the map card's header: one "What if…" menu holding
 * the life-change diffs (each with a knob the human can set — partner
 * income, years older — so hand-driven what-ifs match what the agent can
 * build), and a zoom popover for the income range. Annotation lives in the
 * cliff card, history in the Explored tile.
 */

import { useEffect, useRef, useState } from "react";
import { runDiff, runSweep, runSweep2D } from "../probes/runProbes";
import { DIFF_PRESETS, type DiffPreset } from "../probes/uiPresets";
import { usePeiraStore } from "../state/store";

const SWEEP_MIN = 0;
const SWEEP_MAX = 200_000;
const DEFAULT_RANGE = { min: 0, max: 100_000 };
/** Narrowest range worth a 101-point sweep. */
const MIN_SPAN = 5_000;

const fmtK = (v: number) =>
  Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;

/** Closes the dropdown on any click outside it or on Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export function MapControls() {
  const household = usePeiraStore((s) => s.household);
  const isProbing = usePeiraStore((s) => s.isProbing);
  const sweep = usePeiraStore((s) => s.sweep);

  const [whatIfOpen, setWhatIfOpen] = useState(false);
  /** Preset whose knob is being set, keyed by label. */
  const [arming, setArming] = useState<{ label: string; value: string } | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomMin, setZoomMin] = useState("");
  const [zoomMax, setZoomMax] = useState("");

  const closeWhatIf = () => {
    setWhatIfOpen(false);
    setArming(null);
  };
  const whatIfRef = useDismiss(whatIfOpen, closeWhatIf);
  const zoomRef = useDismiss(zoomOpen, () => setZoomOpen(false));

  const available = DIFF_PRESETS.filter((p) => p.isAvailable(household));
  // Mirrors the sweep_2d tool's guard: the map's y axis is a child's
  // childcare cost, so it needs at least one child on the card.
  const hasChild = household.children.length > 0;
  const axis = sweep?.axis;
  const isZoomed =
    axis && (axis.min !== DEFAULT_RANGE.min || axis.max !== DEFAULT_RANGE.max);

  const runPreset = (preset: DiffPreset, value: number) => {
    closeWhatIf();
    void runDiff(
      { ...household, ...preset.variant(household, value) },
      preset.runLabel(value),
      "human",
    ).catch(() => {});
  };

  const submitZoom = () => {
    const min = Math.max(SWEEP_MIN, Math.round(Number(zoomMin) || 0));
    const max = Math.min(SWEEP_MAX, Math.round(Number(zoomMax) || 0));
    if (max - min < MIN_SPAN) return;
    setZoomOpen(false);
    void runSweep({ min, max }, "human").catch(() => {});
  };

  return (
    <div className="map-controls">
      {(available.length > 0 || hasChild) && (
        <div className="menu-wrap" ref={whatIfRef}>
          <button
            className="btn"
            aria-expanded={whatIfOpen}
            aria-haspopup="menu"
            disabled={isProbing}
            onClick={() => (whatIfOpen ? closeWhatIf() : setWhatIfOpen(true))}
          >
            What if… ▾
          </button>
          {whatIfOpen && (
            <div className="menu-pop" role="menu">
              {available.map((preset) => {
                const isArming = arming?.label === preset.label;
                if (isArming && preset.param) {
                  const p = preset.param;
                  const run = () =>
                    runPreset(
                      preset,
                      Math.max(p.min, Math.min(p.max, Number(arming.value) || p.defaultValue)),
                    );
                  return (
                    <div key={preset.label} className="menu-param">
                      <span className="menu-param-label">
                        {preset.label} — {p.label}
                      </span>
                      <span className="menu-param-row">
                        <input
                          className="zoom-input"
                          type="number"
                          min={p.min}
                          max={p.max}
                          step={p.step}
                          value={arming.value}
                          onChange={(e) => setArming({ ...arming, value: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && run()}
                          autoFocus
                          aria-label={p.label}
                        />
                        <button className="btn" disabled={isProbing} onClick={run}>
                          run
                        </button>
                      </span>
                    </div>
                  );
                }
                return (
                  <button
                    key={preset.label}
                    className="menu-item"
                    role="menuitem"
                    disabled={isProbing}
                    title="Overlays the changed life against today's"
                    onClick={() => {
                      if (preset.param) {
                        setArming({
                          label: preset.label,
                          value: String(preset.param.defaultValue),
                        });
                      } else {
                        runPreset(preset, 0);
                      }
                    }}
                  >
                    {preset.label}
                    {preset.param && <small>…</small>}
                  </button>
                );
              })}
              {hasChild && (
                <button
                  className="menu-item"
                  role="menuitem"
                  disabled={isProbing}
                  title="One map of every earnings × childcare-cost combination — the red walls are benefit cliffs"
                  onClick={() => {
                    closeWhatIf();
                    void runSweep2D(
                      { variable: "employment_income", min: 0, max: 100_000, count: 41 },
                      { variable: "pre_subsidy_childcare_expenses", min: 0, max: 30_000, count: 21 },
                      "human",
                    ).catch(() => {});
                  }}
                >
                  you’re weighing childcare costs
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="menu-wrap" ref={zoomRef}>
        <button
          className="btn"
          aria-expanded={zoomOpen}
          disabled={isProbing}
          title="Re-map a narrower or wider income range (finer detail)"
          onClick={() => {
            if (!zoomOpen) {
              setZoomMin(String(axis?.min ?? DEFAULT_RANGE.min));
              setZoomMax(String(axis?.max ?? DEFAULT_RANGE.max));
            }
            setZoomOpen((o) => !o);
          }}
        >
          {isZoomed ? `zoom · ${fmtK(axis!.min)}–${fmtK(axis!.max)}` : "zoom"}
        </button>
        {zoomOpen && (
          <div className="menu-pop zoom-pop">
            <input
              className="zoom-input"
              type="number"
              step={1000}
              min={SWEEP_MIN}
              max={SWEEP_MAX}
              value={zoomMin}
              onChange={(e) => setZoomMin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitZoom()}
              aria-label="map from yearly earnings"
            />
            –
            <input
              className="zoom-input"
              type="number"
              step={1000}
              min={SWEEP_MIN}
              max={SWEEP_MAX}
              value={zoomMax}
              onChange={(e) => setZoomMax(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitZoom()}
              aria-label="map to yearly earnings"
            />
            <button className="btn" disabled={isProbing} onClick={submitZoom}>
              go
            </button>
            {isZoomed && (
              <button
                className="btn"
                disabled={isProbing}
                title="Back to the full $0–$100k map"
                onClick={() => {
                  setZoomOpen(false);
                  void runSweep(DEFAULT_RANGE, "human").catch(() => {});
                }}
              >
                reset
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
