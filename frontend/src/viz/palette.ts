/**
 * Program layer identity: fixed colors and fixed stack order.
 *
 * The hue order IS the stacking order — it's the dataviz reference palette's
 * validated adjacent-pair sequence for dark surfaces (worst adjacent CVD
 * dE 8.4, >=8 target), so neighboring layers stay distinguishable under
 * color-vision deficiency. Never reorder one without the other; color follows
 * the program, never its size or rank.
 */

export interface ProgramLayer {
  slug: string;
  label: string;
  color: string;
}

/** Bottom-to-top stack order. Health programs sit adjacent on purpose. */
export const PROGRAM_LAYERS: ProgramLayer[] = [
  { slug: "medicaid", label: "Medicaid", color: "#3987e5" },
  { slug: "chip", label: "CHIP", color: "#d95926" },
  { slug: "aca", label: "ACA credit", color: "#199e70" },
  { slug: "snap", label: "SNAP", color: "#c98500" },
  { slug: "tanf", label: "TANF", color: "#d55181" },
  { slug: "childcare", label: "Childcare (CCAP)", color: "#008300" },
  { slug: "eitc", label: "EITC", color: "#9085e9" },
  { slug: "ctc", label: "CTC", color: "#e66767" },
];

/** The non-program ground the stack sits on: earnings after taxes. */
export const BASE_LAYER = { label: "Earnings after taxes", color: "#3a3a37" };

/** Status color for cliff badges (never reused as a series color). */
export const CLIFF_COLOR = "#d03b3b";

export const CHART_CHROME = {
  surface: "#1a1a19",
  grid: "#2c2c2a",
  axis: "#383835",
  inkPrimary: "#ffffff",
  inkSecondary: "#c3c2b7",
  inkMuted: "#898781",
};
