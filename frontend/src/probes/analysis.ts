/**
 * Pure curve-analysis helpers for tool replies. The compact-results rule
 * (never dump raw 101-point arrays into the model context) survives because
 * these DERIVE the analysis-bearing numbers — checkpoints, recovery points,
 * dead zones, crossings, ridges — from arrays that stay in the store.
 */

import type { Cliff, HeatmapResult, SweepResult } from "../types";

/** Marginal keep-rate below which a stretch counts as a dead zone. */
const DEAD_ZONE_KEEP_RATE = 0.25;
/** Minimum earnings width for a reportable dead zone. */
const DEAD_ZONE_MIN_WIDTH = 10_000;
const MAX_DEAD_ZONES = 3;
/** Net-income jump (per grid step) that reads as a cliff ridge in a heatmap. */
const RIDGE_DROP_THRESHOLD = 1_000;
/** Program delta that counts as "this interaction bites here". */
const BITE_THRESHOLD = 50;

/** Linear interpolation of y(at) over sorted xs; clamps outside the range. */
export function interpolate(xs: number[], ys: number[], at: number): number {
  if (at <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (at >= xs[last]) return ys[last];
  let i = 1;
  while (xs[i] < at) i += 1;
  const t = (at - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[i - 1] + t * (ys[i] - ys[i - 1]);
}

export interface Checkpoint {
  x: number;
  net: number;
}

/** Evenly spaced (x, net) samples — the curve's shape at a glance. */
export function sampleCheckpoints(
  xs: number[],
  net: number[],
  count: number,
): Checkpoint[] {
  const last = xs.length - 1;
  const step = last / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.round(i * step);
    return { x: xs[idx], net: net[idx] };
  });
}

/**
 * First earnings level past the cliff where net resources regain their
 * pre-cliff value — "a raise past $80k leaves you worse off until $95k".
 * Null when the curve never recovers within the swept range.
 */
export function cliffRecovery(
  xs: number[],
  net: number[],
  cliff: Cliff,
): number | null {
  const fromIdx = xs.findIndex((x) => x >= cliff.from_x);
  if (fromIdx < 0) return null;
  const peak = net[fromIdx];
  for (let i = fromIdx + 1; i < xs.length; i += 1) {
    if (xs[i] > cliff.to_x && net[i] >= peak) return xs[i];
  }
  return null;
}

export interface DeadZone {
  from_x: number;
  to_x: number;
  earnings_gain: number;
  net_gain: number;
}

/**
 * Maximal stretches where extra earnings barely move net resources
 * (cumulative keep-rate under DEAD_ZONE_KEEP_RATE). These plateaus are often
 * the most actionable finding for a worker weighing a raise.
 */
export function findDeadZones(xs: number[], net: number[]): DeadZone[] {
  // For each start, keep the end with the WORST keep-rate (not the widest
  // span — the widest tends to be a diluted whole-range statement).
  const candidates: DeadZone[] = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    let best: DeadZone | null = null;
    let bestRate = DEAD_ZONE_KEEP_RATE;
    for (let j = i + 1; j < xs.length; j += 1) {
      const earned = xs[j] - xs[i];
      if (earned < DEAD_ZONE_MIN_WIDTH) continue;
      const rate = (net[j] - net[i]) / earned;
      if (rate < bestRate) {
        bestRate = rate;
        best = {
          from_x: xs[i],
          to_x: xs[j],
          earnings_gain: earned,
          net_gain: net[j] - net[i],
        };
      }
    }
    if (best) candidates.push(best);
  }
  // Most extreme keep-rate first, then keep non-overlapping ones.
  const rateOf = (z: DeadZone) => z.net_gain / z.earnings_gain;
  candidates.sort((a, b) => rateOf(a) - rateOf(b));
  const picked: DeadZone[] = [];
  for (const zone of candidates) {
    const overlaps = picked.some(
      (p) => zone.from_x < p.to_x && zone.to_x > p.from_x,
    );
    if (!overlaps) picked.push(zone);
    if (picked.length === MAX_DEAD_ZONES) break;
  }
  return picked.sort((a, b) => a.from_x - b.from_x);
}

export interface YouAreHere {
  current_earnings: number;
  net_resources: number;
  next_cliff: { at: number; distance: number; dominant_program: string } | null;
}

/** Where the household currently sits on the swept curve; null if outside it. */
export function locateHousehold(
  sweep: SweepResult,
  currentEarnings: number,
): YouAreHere | null {
  const { x: xs, net_income: net, cliffs } = sweep;
  if (currentEarnings < xs[0] || currentEarnings > xs[xs.length - 1]) {
    return null;
  }
  const ahead = cliffs
    .filter((c) => c.from_x >= currentEarnings)
    .sort((a, b) => a.from_x - b.from_x)[0];
  return {
    current_earnings: currentEarnings,
    net_resources: interpolate(xs, net, currentEarnings),
    next_cliff: ahead
      ? {
          at: ahead.from_x,
          distance: ahead.from_x - currentEarnings,
          dominant_program: ahead.dominant_program,
        }
      : null,
  };
}

export interface DiffSegment {
  from_x: number;
  to_x: number;
  leader: "variant" | "current household" | "even";
}

/**
 * Split the sweep at the points where the variant/baseline gap changes sign —
 * turns "the curves cross twice" into "variant wins above $41k".
 */
export function diffSegments(xs: number[], deltas: number[]): DiffSegment[] {
  const crossings: number[] = [];
  for (let i = 1; i < deltas.length; i += 1) {
    if (Math.sign(deltas[i]) !== Math.sign(deltas[i - 1])) {
      const t = deltas[i - 1] / (deltas[i - 1] - deltas[i]);
      crossings.push(xs[i - 1] + t * (xs[i] - xs[i - 1]));
    }
  }
  const bounds = [xs[0], ...crossings, xs[xs.length - 1]];
  const segments: DiffSegment[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const mid = (bounds[i] + bounds[i + 1]) / 2;
    const gap = interpolate(xs, deltas, mid);
    segments.push({
      from_x: bounds[i],
      to_x: bounds[i + 1],
      leader: Math.abs(gap) < 100 ? "even" : gap > 0 ? "variant" : "current household",
    });
  }
  return segments.slice(0, 6);
}

export interface RidgeRow {
  childcare_cost: number;
  cliffs_at: number[];
  widest_safe_span: { from_x: number; to_x: number } | null;
}

/**
 * Sample a few childcare-cost rows of the heatmap and report where the cliff
 * ridges sit along earnings, plus the widest cliff-free earnings span — the
 * "safe region" answer the heatmap's on-screen ridges encode visually.
 */
export function heatmapRidges(heatmap: HeatmapResult): RidgeRow[] {
  const { axis_x, axis_y, net_income } = heatmap;
  const rows = net_income.length;
  const xAt = (i: number) =>
    axis_x.min + (i * (axis_x.max - axis_x.min)) / (axis_x.count - 1);
  const yAt = (i: number) =>
    axis_y.min + (i * (axis_y.max - axis_y.min)) / (axis_y.count - 1);
  const sampled = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => Math.round(f * (rows - 1)))
    .filter((v, i, arr) => arr.indexOf(v) === i);
  return sampled.map((rowIdx) => {
    const row = net_income[rowIdx];
    const cliffsAt: number[] = [];
    for (let i = 1; i < row.length; i += 1) {
      if (row[i] - row[i - 1] < -RIDGE_DROP_THRESHOLD) cliffsAt.push(xAt(i));
    }
    const edges = [axis_x.min, ...cliffsAt, axis_x.max];
    let widest: { from_x: number; to_x: number } | null = null;
    for (let i = 0; i < edges.length - 1; i += 1) {
      const width = edges[i + 1] - edges[i];
      if (!widest || width > widest.to_x - widest.from_x) {
        widest = { from_x: edges[i], to_x: edges[i + 1] };
      }
    }
    return { childcare_cost: yAt(rowIdx), cliffs_at: cliffsAt, widest_safe_span: widest };
  });
}

export interface BiteRange {
  from_x: number;
  to_x: number;
}

/** Earnings range where an ablation interaction actually moves a program. */
export function interactionBite(
  xs: number[],
  baselineSeries: number[] | undefined,
  ablatedSeries: number[] | undefined,
): BiteRange | null {
  if (!baselineSeries || !ablatedSeries) return null;
  let first = -1;
  let last = -1;
  for (let i = 0; i < xs.length; i += 1) {
    if (Math.abs(ablatedSeries[i] - baselineSeries[i]) > BITE_THRESHOLD) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return null;
  return { from_x: xs[first], to_x: xs[last] };
}
