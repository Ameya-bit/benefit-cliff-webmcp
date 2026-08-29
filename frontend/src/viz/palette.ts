/**
 * Program layer identity: fixed colors and fixed stack order.
 *
 * The hue order IS the stacking order — it's the dataviz reference palette's
 * validated adjacent-pair sequence (light-surface steps; worst adjacent CVD
 * dE 9.1, >=8 target), so neighboring layers stay distinguishable under
 * color-vision deficiency. Never reorder one without the other; color follows
 * the program, never its size or rank. Labels are plain-language: the chat
 * agent and the explainer panel carry the official names.
 */

export interface ProgramLayer {
  slug: string;
  label: string;
  color: string;
}

/** Bottom-to-top stack order. Health programs sit adjacent on purpose. */
export const PROGRAM_LAYERS: ProgramLayer[] = [
  { slug: "medicaid", label: "Medicaid", color: "#2a78d6" },
  { slug: "chip", label: "Kids’ health (CHIP)", color: "#eb6834" },
  { slug: "aca", label: "Insurance credit (ACA)", color: "#1baf7a" },
  { slug: "snap", label: "Food aid (SNAP)", color: "#eda100" },
  { slug: "tanf", label: "Cash aid (TANF)", color: "#e87ba4" },
  { slug: "childcare", label: "Childcare help (CCAP)", color: "#008300" },
  { slug: "eitc", label: "Earned-income credit", color: "#4a3aa7" },
  { slug: "ctc", label: "Child tax credit", color: "#e34948" },
];

export const programLabel = (slug: string): string =>
  PROGRAM_LAYERS.find((l) => l.slug === slug)?.label ?? slug;

export const programColor = (slug: string): string =>
  PROGRAM_LAYERS.find((l) => l.slug === slug)?.color ?? "#999999";

/** The non-program ground the stack sits on: earnings after taxes. */
export const BASE_LAYER = { label: "Pay after taxes", color: "#c3c2b7" };

/** Status color for cliff badges (never reused as a series color). */
export const CLIFF_COLOR = "#cc3b3b";

export const CHART_CHROME = {
  surface: "#ffffff",
  grid: "#ececec",
  axis: "#dddddd",
  inkPrimary: "#171717",
  inkSecondary: "#666666",
  inkMuted: "#767676",
};
