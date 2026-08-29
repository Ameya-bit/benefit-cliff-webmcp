/**
 * "Explored so far" — the lab notebook. Every probe result (by either
 * party) lands here as a reopenable thumbnail; clicking one restores that
 * canvas state. This replaces a textual probe log: the notebook IS the
 * session's audit trail, tagged by who ran what.
 */

import type { GalleryEntry } from "../state/store";
import { usePeiraStore } from "../state/store";
import { CHART_CHROME as C } from "../viz/palette";

const TW = 120;
const TH = 30;

/** Downsampled net-income polyline for sweep-like entries. */
function netPath(entry: GalleryEntry): string | null {
  const sweep = entry.sweep;
  if (!sweep || sweep.x.length < 2) return null;
  const net = sweep.net_income;
  const max = Math.max(...net) || 1;
  const min = Math.min(0, ...net);
  const pts: string[] = [];
  const N = 30;
  for (let i = 0; i <= N; i += 1) {
    const idx = Math.round((i / N) * (net.length - 1));
    const px = 3 + (i / N) * (TW - 6);
    const py = 4 + (1 - (net[idx] - min) / (max - min || 1)) * (TH - 8);
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return `M ${pts.join(" L")}`;
}

function Thumb({ entry }: { entry: GalleryEntry }) {
  const main = netPath(entry);
  const ghost =
    entry.baselineSweep && entry.baselineSweep.x.length > 1
      ? netPath({ ...entry, sweep: entry.baselineSweep, baselineSweep: null })
      : null;
  const diff =
    entry.view.mode === "diff"
      ? netPath({ ...entry, sweep: entry.view.diff.b, baselineSweep: null })
      : null;
  const diffA =
    entry.view.mode === "diff"
      ? netPath({ ...entry, sweep: entry.view.diff.a, baselineSweep: null })
      : null;

  return (
    <svg viewBox={`0 0 ${TW} ${TH}`} aria-hidden="true">
      {entry.kind === "heatmap" &&
        [0, 1, 2, 3, 4, 5].map((i) =>
          [0, 1, 2].map((j) => (
            <rect
              key={`${i}${j}`}
              x={4 + i * 19}
              y={3 + j * 8.5}
              width={17}
              height={7}
              rx={2}
              fill="#2a78d6"
              opacity={0.15 + ((i + j) % 4) * 0.18}
            />
          )),
        )}
      {entry.view.mode === "diff" ? (
        <>
          {diffA && <path d={diffA} fill="none" stroke={C.inkPrimary} strokeWidth={1.3} />}
          {diff && (
            <path d={diff} fill="none" stroke="#1c5cab" strokeWidth={1.3} strokeDasharray="3 3" />
          )}
        </>
      ) : (
        <>
          {ghost && (
            <path d={ghost} fill="none" stroke={C.inkMuted} strokeWidth={1} strokeDasharray="3 3" />
          )}
          {main && <path d={main} fill="none" stroke={C.inkPrimary} strokeWidth={1.3} />}
        </>
      )}
    </svg>
  );
}

/** One-line gist: what this snapshot found. */
function subtitle(entry: GalleryEntry): string {
  if (entry.kind === "heatmap") return "safety grid";
  if (entry.view.mode === "diff") return "vs today";
  const n = entry.sweep?.cliffs.length ?? 0;
  return `${n} cliff${n === 1 ? "" : "s"}`;
}

export function Rail() {
  const gallery = usePeiraStore((s) => s.gallery);
  const activeId = usePeiraStore((s) => s.activeGalleryId);
  const restoreGallery = usePeiraStore((s) => s.restoreGallery);
  const isProbing = usePeiraStore((s) => s.isProbing);

  // newest first
  const entries = [...gallery].reverse();

  // The tray only exists once there is history to reopen.
  if (entries.length < 2) return null;

  return (
    <div className="rail">
      <span className="eyebrow">Explored so far</span>
      {entries.map((entry) => (
        <button
          key={entry.id}
          className={`thumb${entry.id === activeId ? " selected" : ""}`}
          disabled={isProbing}
          onClick={() => restoreGallery(entry.id)}
          title={`${entry.title} — reopen this result`}
        >
          <Thumb entry={entry} />
          <span className="t-title">{entry.title}</span>
          <span className="t-meta">
            <span className={`voice-badge ${entry.source}`}>
              {entry.source === "agent" ? "agent" : "you"}
            </span>
            <span className="t-sub">{subtitle(entry)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
