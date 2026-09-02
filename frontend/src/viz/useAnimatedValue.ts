import { useEffect, useRef, useState } from "react";

const DURATION_MS = 380;

const easeCubicOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animates one number toward a target — the scalar sibling of
 * useAnimatedMatrix. A jump in the target (a cliff click moving the money
 * flow's income, a pin releasing back to the household's earnings) glides
 * instead of snapping; during a scrub the tween restarts every frame from
 * wherever it is, which reads as a tight smooth-follow. Honors
 * prefers-reduced-motion by jumping. Callers that must move in step with
 * another animation can pass its duration and easing (the sweep map's
 * domain glides in sync with useAnimatedMatrix this way).
 */
export function useAnimatedValue(
  target: number,
  durationMs: number = DURATION_MS,
  easing: (t: number) => number = easeCubicOut,
): number {
  const [current, setCurrent] = useState(target);
  const currentRef = useRef(target);
  currentRef.current = current;
  const frame = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    const from = currentRef.current;
    if (from === target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !Number.isFinite(from)) {
      setCurrent(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setCurrent(from + (target - from) * easing(t));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return current;
}
