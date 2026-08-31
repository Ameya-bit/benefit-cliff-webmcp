// Generates the stacked-sweep SVG fragments used by the design-refresh
// artboards. Synthetic but shaped like the real Colorado demo: CCCAP cliff
// at $51k (−$15k), Medicaid step at $38k, CHIP cliff at $66k.
// Usage: node gen-chart.mjs  → writes parts/chart-<name>.svg
import { mkdirSync, writeFileSync } from "node:fs";

const LAYERS = [
  { slug: "medicaid", color: "#2a78d6" },
  { slug: "chip", color: "#eb6834" },
  { slug: "aca", color: "#1baf7a" },
  { slug: "snap", color: "#eda100" },
  { slug: "tanf", color: "#e87ba4" },
  { slug: "childcare", color: "#008300" },
  { slug: "eitc", color: "#4a3aa7" },
  { slug: "ctc", color: "#e34948" },
];
const BASE_COLOR = "#c3c2b7";

const xs = [];
for (let x = 0; x <= 100_000; x += 1000) xs.push(x);

const val = {
  medicaid: (x) => (x <= 38_000 ? 7_200 : x <= 60_000 ? 3_100 : 0),
  chip: (x) => (x > 38_000 && x <= 66_000 ? 2_800 : 0),
  aca: (x) => (x > 60_000 ? Math.max(900, 1_800 - (x - 60_000) * 0.02) : 0),
  snap: (x) => Math.max(0, 6_400 * (1 - x / 46_000)),
  tanf: (x) => Math.max(0, 3_600 * (1 - x / 14_000)),
  childcare: (x) => (x <= 51_000 ? 15_200 : 0),
  eitc: (x) =>
    x <= 16_000
      ? (x / 16_000) * 5_800
      : x <= 26_000
        ? 5_800
        : Math.max(0, 5_800 * (1 - (x - 26_000) / 30_000)),
  ctc: (x) => Math.min(4_400, x * 0.55),
};
const tax = (x) => 0.08 * x + 0.1 * Math.max(0, x - 40_000);
const base = (x) => x - tax(x);

// cumulative rows: row 0 = base, row k adds layer k
const rows = [xs.map(base)];
for (const l of LAYERS) {
  const prev = rows[rows.length - 1];
  rows.push(prev.map((v, i) => v + val[l.slug](xs[i])));
}
const net = rows[rows.length - 1];

function fragment({ W, H, M, chrome, seam }) {
  const PLOT_W = W - M.left - M.right;
  const PLOT_H = H - M.top - M.bottom;
  const yMax = Math.max(...net) * 1.06;
  const sx = (v) => (M.left + (v / 100_000) * PLOT_W).toFixed(1);
  const sy = (v) => (M.top + PLOT_H - (v / yMax) * PLOT_H).toFixed(1);
  const area = (lower, upper) => {
    const fwd = xs.map((x, i) => `${sx(x)},${sy(upper[i])}`).join(" L");
    const back = [...xs]
      .reverse()
      .map((x, i) => `${sx(x)},${sy(lower[xs.length - 1 - i])}`)
      .join(" L");
    return `M${fwd} L${back} Z`;
  };
  const line = xs.map((x, i) => `${sx(x)},${sy(net[i])}`).join(" L");

  let out = "";
  // grid + y labels
  for (let v = 0; v <= yMax; v += 20_000) {
    out += `<line x1="${M.left}" y1="${sy(v)}" x2="${W - M.right}" y2="${sy(v)}" stroke="${chrome.grid}" stroke-width="1"/>\n`;
    out += `<text x="${M.left - 7}" y="${+sy(v) + 4}" text-anchor="end" font-size="13" fill="${chrome.inkSecondary}">$${v / 1000}k</text>\n`;
  }
  for (let v = 0; v <= 100_000; v += 20_000) {
    out += `<text x="${sx(v)}" y="${H - M.bottom + 19}" text-anchor="middle" font-size="13" fill="${chrome.inkSecondary}">$${v / 1000}k</text>\n`;
  }
  // layers (class per slug so studies can restyle/animate)
  out += `<g class="layers">\n`;
  out += `<path class="layer base" d="${area(xs.map(() => 0), rows[0])}" fill="${BASE_COLOR}" fill-opacity="0.55" stroke="${seam}" stroke-width="2"/>\n`;
  LAYERS.forEach((l, k) => {
    out += `<path class="layer ${l.slug}" d="${area(rows[k], rows[k + 1])}" fill="${l.color}" fill-opacity="0.82" stroke="${seam}" stroke-width="2"/>\n`;
  });
  out += `</g>\n`;
  out += `<path class="net-line" d="M${line}" fill="none" stroke="${chrome.inkPrimary}" stroke-width="2.2"/>\n`;
  out += `<line x1="${M.left}" y1="${sy(0)}" x2="${W - M.right}" y2="${sy(0)}" stroke="${chrome.axis}" stroke-width="1"/>\n`;
  // axis titles
  out += `<text x="${W - M.right - 4}" y="${H - M.bottom - 8}" text-anchor="end" font-size="12.5" fill="${chrome.inkMuted}">yearly earnings →</text>\n`;
  out += `<text x="4" y="16" font-size="12.5" fill="${chrome.inkMuted}">what your family keeps ↑</text>\n`;

  // anchors the artboards need (cliff drop points, you-marker)
  const anchors = {
    cliff51: { x: +sx(51_000), y: +sy(net[51]) },
    cliff51b: { x: +sx(52_000), y: +sy(net[52]) },
    cliff38: { x: +sx(38_000), y: +sy(net[38]) },
    cliff66: { x: +sx(66_000), y: +sy(net[66]) },
    you32: { x: +sx(32_000), y: +sy(net[32]) },
    plot: { left: M.left, right: W - M.right, top: M.top, bottom: H - M.bottom },
  };
  return { out, anchors };
}

mkdirSync(new URL("./parts/", import.meta.url), { recursive: true });
const variants = {
  // warm paper direction: card surface #fbf8f2
  warm: {
    W: 1240, H: 430, M: { top: 40, right: 14, bottom: 30, left: 56 },
    seam: "#fbf8f2",
    chrome: { grid: "#eee8dc", axis: "#ddd5c4", inkPrimary: "#1f1b16", inkSecondary: "#6b6459", inkMuted: "#77705f" },
  },
  // ink & paper direction: near-white paper, darker ink
  ink: {
    W: 1240, H: 430, M: { top: 40, right: 14, bottom: 30, left: 56 },
    seam: "#fdfcf9",
    chrome: { grid: "#ebe9e4", axis: "#d9d6cf", inkPrimary: "#141210", inkSecondary: "#5c5850", inkMuted: "#6c675e" },
  },
  // stone & sand direction: card surface #f5f1e8
  sand: {
    W: 1240, H: 430, M: { top: 40, right: 14, bottom: 30, left: 56 },
    seam: "#f5f1e8",
    chrome: { grid: "#e7dfcd", axis: "#d6cdb9", inkPrimary: "#201c15", inkSecondary: "#6b6459", inkMuted: "#77705f" },
  },
  // wide study frame for the motion + cliff treatments
  study: {
    W: 1240, H: 460, M: { top: 46, right: 14, bottom: 32, left: 56 },
    seam: "#fbf8f2",
    chrome: { grid: "#eee8dc", axis: "#ddd5c4", inkPrimary: "#1f1b16", inkSecondary: "#6b6459", inkMuted: "#77705f" },
  },
};
for (const [name, cfg] of Object.entries(variants)) {
  const { out, anchors } = fragment(cfg);
  writeFileSync(new URL(`./parts/chart-${name}.svg`, import.meta.url), out);
  console.log(name, JSON.stringify(anchors));
}
