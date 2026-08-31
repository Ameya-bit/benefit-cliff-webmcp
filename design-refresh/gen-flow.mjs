// Money-flow (sankey) fragments at $32k earnings, matching MoneyFlow.tsx's
// ribbon geometry. Usage: node gen-flow.mjs → writes parts/flow-<name>.svg
import { mkdirSync, writeFileSync } from "node:fs";

const NODE_W = 10;
const GAP = 8;

// values at $32k (same synthetic model as gen-chart.mjs)
const AT = 32_000;
const TAXES = 2_560;
const STREAMS = [
  { slug: "job", label: "The job", color: "INK", value: AT },
  { slug: "childcare", label: "Childcare help (CCCAP)", color: "#008300", value: 15_200 },
  { slug: "medicaid", label: "Medicaid", color: "#2a78d6", value: 7_200 },
  { slug: "eitc", label: "Earned-income credit", color: "#4a3aa7", value: 4_640 },
  { slug: "ctc", label: "Child tax credit", color: "#e34948", value: 4_400 },
  { slug: "snap", label: "Food aid (SNAP)", color: "#eda100", value: 1_950 },
];
const INACTIVE = ["Kids’ health (CHIP)", "Insurance credit (ACA)", "Cash aid (TANF)"];
const NET = STREAMS.reduce((a, s) => a + s.value, 0) - TAXES;

const fmt = (v) => `$${Math.round(v).toLocaleString("en-US")}`;

function fragment({ W, H, compact, ink, inkSecondary, inkMuted, axis }) {
  const TOP = 12;
  const X_LABEL = compact ? 210 : 225;
  const X_NODE = X_LABEL + 12;
  const X_KEEP = W - (compact ? 150 : 170);
  const MID = (X_NODE + X_KEEP) / 2;
  const ribbon = (y1, h1, y2, h2) =>
    `M ${X_NODE + NODE_W} ${y1.toFixed(1)} C ${MID} ${y1.toFixed(1)}, ${MID} ${y2.toFixed(1)}, ${X_KEEP} ${y2.toFixed(1)}` +
    ` L ${X_KEEP} ${(y2 + h2).toFixed(1)} C ${MID} ${(y2 + h2).toFixed(1)}, ${MID} ${(y1 + h1).toFixed(1)}, ${X_NODE + NODE_W} ${(y1 + h1).toFixed(1)} Z`;

  const nInactive = compact ? 0 : INACTIVE.length;
  const ROW_PITCH = 17;
  const taxReserve = 34;
  const plotH = H - TOP - nInactive * ROW_PITCH - taxReserve - STREAMS.length * GAP - 24;
  const totalIn = STREAMS.reduce((a, s) => a + s.value, 0);
  const scale = plotH / totalIn;

  let out = "";
  let y = TOP;
  const placed = STREAMS.map((s) => {
    const h = Math.max(3, s.value * scale);
    const p = { ...s, h, yL: y };
    y += h + GAP;
    return p;
  });
  let yr = TOP + 8;
  for (const s of placed) {
    s.hR = Math.max(2.5, (s.slug === "job" ? s.value - TAXES : s.value) * scale);
    s.yR = yr;
    yr += s.hR;
  }
  const keepsTop = TOP + 8;
  const keepsBot = yr;

  for (const s of placed) {
    const useH = s.slug === "job" ? Math.max(2.5, (s.value - TAXES) * scale) : s.h;
    const fill = s.color === "INK" ? ink : s.color;
    out += `<path d="${ribbon(s.yL, useH, s.yR, s.hR)}" fill="${fill}" opacity="0.4"/>\n`;
  }
  // taxes branch
  const job = placed[0];
  const taxH = TAXES * scale;
  const inactiveY = y + 4;
  const taxY = Math.max(keepsBot, inactiveY + nInactive * ROW_PITCH) + 10;
  const taxOutH = Math.max(3, Math.min(taxH * 0.8, H - taxY - 6));
  out += `<path d="${ribbon(job.yL + job.h - taxH, taxH, taxY, taxOutH)}" fill="#b3b3b3" opacity="0.35"/>\n`;
  out += `<rect x="${X_KEEP}" y="${taxY.toFixed(1)}" width="${NODE_W}" height="${taxOutH.toFixed(1)}" rx="2.5" fill="#b3b3b3"/>\n`;
  out += `<text x="${X_KEEP + 20}" y="${(taxY + taxOutH / 2 + 4).toFixed(1)}" font-size="11.5" fill="${inkMuted}">Taxes · −${fmt(TAXES)}</text>\n`;
  // source bars + labels
  for (const s of placed) {
    const fill = s.color === "INK" ? ink : s.color;
    out += `<rect x="${X_NODE}" y="${s.yL.toFixed(1)}" width="${NODE_W}" height="${s.h.toFixed(1)}" rx="3" fill="${fill}"/>\n`;
    out += `<text x="${X_LABEL}" y="${(s.yL + Math.min(s.h / 2, 24) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="${ink}">${s.label} · ${fmt(s.value)}</text>\n`;
  }
  // inactive $0 rows
  if (!compact) {
    INACTIVE.forEach((label, i) => {
      const iy = inactiveY + i * ROW_PITCH;
      out += `<rect x="${X_NODE}" y="${iy.toFixed(1)}" width="${NODE_W}" height="7" rx="2.5" fill="none" stroke="${axis}" stroke-dasharray="3 3"/>\n`;
      out += `<text x="${X_LABEL}" y="${(iy + 7).toFixed(1)}" text-anchor="end" font-size="11" fill="${inkMuted}">${label} · $0</text>\n`;
    });
  }
  // destination
  out += `<rect x="${X_KEEP}" y="${keepsTop}" width="12" height="${(keepsBot - keepsTop).toFixed(1)}" rx="4" fill="${ink}"/>\n`;
  const midY = (keepsTop + keepsBot) / 2;
  out += `<text x="${X_KEEP + 22}" y="${(midY - 18).toFixed(1)}" font-size="11.5" fill="${inkSecondary}"><tspan x="${X_KEEP + 22}">What your</tspan><tspan x="${X_KEEP + 22}" dy="14">family keeps</tspan></text>\n`;
  out += `<text x="${X_KEEP + 22}" y="${(midY + 16).toFixed(1)}" font-size="13" font-weight="600" fill="${ink}">${fmt(NET)}</text>\n`;
  return out;
}

mkdirSync(new URL("./parts/", import.meta.url), { recursive: true });
const variants = {
  "compact-warm": { W: 560, H: 235, compact: true, ink: "#1f1b16", inkSecondary: "#6b6459", inkMuted: "#77705f", axis: "#ddd5c4" },
  "compact-sand": { W: 560, H: 235, compact: true, ink: "#201c15", inkSecondary: "#6b6459", inkMuted: "#77705f", axis: "#d6cdb9" },
  "compact-ink": { W: 560, H: 235, compact: true, ink: "#141210", inkSecondary: "#5c5850", inkMuted: "#6c675e", axis: "#d9d6cf" },
  "modal-sand": { W: 660, H: 400, compact: false, ink: "#201c15", inkSecondary: "#6b6459", inkMuted: "#77705f", axis: "#d6cdb9" },
  "modal-ink": { W: 660, H: 400, compact: false, ink: "#141210", inkSecondary: "#5c5850", inkMuted: "#6c675e", axis: "#d9d6cf" },
};
for (const [name, cfg] of Object.entries(variants)) {
  writeFileSync(new URL(`./parts/flow-${name}.svg`, import.meta.url), fragment(cfg));
  console.log(name, "ok");
}
