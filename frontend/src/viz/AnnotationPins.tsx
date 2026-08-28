import type { Annotation } from "../types";

interface Props {
  annotations: Annotation[];
  xMin: number;
  xMax: number;
  sx: (v: number) => number;
  /** y of the curve the pin should sit above, at a given data x */
  yAt: (v: number) => number;
}

/** Shared annotation layer: pins render on every x-over-earnings view so a
 * finding never silently disappears when the canvas switches modes. */
export function AnnotationPins({ annotations, xMin, xMax, sx, yAt }: Props) {
  return (
    <>
      {annotations.map((a) => {
        if (a.x < xMin || a.x > xMax) return null;
        const color = a.source === "agent" ? "#3987e5" : "#0ca30c";
        const px = sx(a.x);
        const py = yAt(a.x) - 12;
        return (
          <g key={a.id} className="annotation">
            <line x1={px} y1={py + 2} x2={px} y2={py + 12} stroke={color} strokeWidth={1.5} />
            <path d={`M${px - 6},${py - 8} h12 v9 l-6 4 -6 -4 Z`} fill={color}>
              <title>{`${a.source}: ${a.note}`}</title>
            </path>
          </g>
        );
      })}
    </>
  );
}
