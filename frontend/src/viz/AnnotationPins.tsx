import type { Annotation } from "../types";

interface Props {
  annotations: Annotation[];
  xMin: number;
  xMax: number;
  sx: (v: number) => number;
  /** y of the curve the pin should sit above, at a given data x */
  yAt: (v: number) => number;
}

/** Identity colors, matching --agent / --human tokens (never the cursor
 * blue or cliff red — a pin must read as "someone left this here"). */
const PIN_COLOR = { agent: "#6d5bd0", human: "#047857" } as const;
const LABEL_MAX = 30;

/** Shared annotation layer: pins render on every x-over-earnings view so a
 * finding never silently disappears when the canvas switches modes. Each
 * pin shows its note (truncated) in the author's color; adjacent pins
 * stagger vertically so labels don't stack. */
export function AnnotationPins({ annotations, xMin, xMax, sx, yAt }: Props) {
  const rightEdge = sx(xMax);
  return (
    <>
      {annotations.map((a, i) => {
        if (a.x < xMin || a.x > xMax) return null;
        const color = PIN_COLOR[a.source];
        const px = sx(a.x);
        // Hang below the curve, into the stack: the sky above belongs to the
        // cliff badges. Adjacent pins stagger so labels never stack.
        const curveY = yAt(a.x);
        const py = curveY + 26 + (i % 2) * 22;
        const label =
          a.note.length > LABEL_MAX ? `${a.note.slice(0, LABEL_MAX - 1)}…` : a.note;
        const flip = px > rightEdge - 170;
        return (
          <g key={a.id} className="annotation">
            <circle cx={px} cy={curveY} r={2.5} fill={color} stroke="#ffffff" strokeWidth={1} />
            <line x1={px} y1={curveY + 3} x2={px} y2={py - 9} stroke={color} strokeWidth={1.2} />
            <path d={`M${px - 5},${py - 9} h10 v8 l-5 4 -5 -4 Z`} fill={color}>
              <title>{`${a.source === "agent" ? "Agent" : "You"}: ${a.note}`}</title>
            </path>
            <text
              x={flip ? px - 9 : px + 9}
              y={py}
              textAnchor={flip ? "end" : "start"}
              fontSize={11.5}
              fontWeight={600}
              fill={color}
              stroke="#ffffff"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {label}
            </text>
          </g>
        );
      })}
    </>
  );
}
