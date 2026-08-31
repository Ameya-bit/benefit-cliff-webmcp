/**
 * "Explored so far" — the lab notebook. Every probe result (by either
 * party) lands here as a reopenable thumbnail; clicking one restores that
 * canvas state. This replaces a textual probe log: the notebook IS the
 * session's audit trail, tagged by who ran what.
 */

import { useState } from "react";
import type { GalleryEntry } from "../state/store";
import { usePeiraStore } from "../state/store";
import { CHART_CHROME as C, CLIFF_COLOR } from "../viz/palette";

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
      {entry.kind === "heatmap" && (
        <g>
          {/* the income profile at three daycare costs, cliffs in red */}
          {[7, 15, 23].map((y, k) => (
            <path
              key={y}
              d={`M4 ${y + 2} L38 ${y - 1} L44 ${y + 2.5} L84 ${y}${k < 2 ? ` L89 ${y + 3} L114 ${y + 1}` : ` L114 ${y - 1}`}`}
              fill="none"
              stroke={C.inkPrimary}
              strokeWidth={1.2}
              opacity={0.75}
            />
          ))}
          {[7, 15].map((y) => (
            <g key={`r${y}`} stroke={CLIFF_COLOR} strokeWidth={1.8}>
              <line x1={38} y1={y - 1} x2={44} y2={y + 2.5} />
              <line x1={84} y1={y} x2={89} y2={y + 3} />
            </g>
          ))}
        </g>
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
  if (entry.kind === "heatmap") return "earnings × childcare map";
  if (entry.view.mode === "diff") return "vs today";
  const n = entry.sweep?.cliffs.length ?? 0;
  return `${n} cliff${n === 1 ? "" : "s"}`;
}

export function Rail() {
  const gallery = usePeiraStore((s) => s.gallery);
  const activeId = usePeiraStore((s) => s.activeGalleryId);
  const restoreGallery = usePeiraStore((s) => s.restoreGallery);
  const renameGallery = usePeiraStore((s) => s.renameGallery);
  const isProbing = usePeiraStore((s) => s.isProbing);
  // Entry being renamed (double-click a row); commit on Enter or blur.
  const [editing, setEditing] = useState<{ id: number; title: string } | null>(null);

  // newest first
  const entries = [...gallery].reverse();

  // The notebook tile is never blank: before the first extra result it says
  // what will land here.
  if (entries.length < 1)
    return (
      <p className="rail-empty">
        Every what-if, zoom, and grid you (or the agent) run lands here as a
        reopenable snapshot.
      </p>
    );

  const commitRename = () => {
    if (editing) renameGallery(editing.id, editing.title);
    setEditing(null);
  };

  return (
    <div className="rail">
      {entries.map((entry) =>
        editing?.id === entry.id ? (
          <div key={entry.id} className="thumb editing">
            <Thumb entry={entry} />
            <input
              className="thumb-rename"
              type="text"
              maxLength={60}
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditing(null);
              }}
              onBlur={commitRename}
              autoFocus
              aria-label="rename this snapshot"
            />
          </div>
        ) : (
          <button
            key={entry.id}
            className={`thumb${entry.id === activeId ? " selected" : ""}`}
            disabled={isProbing}
            onClick={() => restoreGallery(entry.id)}
            onDoubleClick={() => setEditing({ id: entry.id, title: entry.title })}
            title={`${entry.title} — click to reopen, double-click to rename`}
          >
            <Thumb entry={entry} />
            <span className="thumb-text">
              <span className="t-title">{entry.title}</span>
              <span className="t-meta">
                <span className={`voice-badge ${entry.source}`}>
                  {entry.source === "agent" ? "agent" : "you"}
                </span>
                <span className="t-sub">{subtitle(entry)}</span>
              </span>
            </span>
          </button>
        ),
      )}
    </div>
  );
}
