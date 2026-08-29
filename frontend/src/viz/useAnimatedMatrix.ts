import { useEffect, useRef, useState } from "react";

const DURATION_MS = 650;

const easeCubicInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Animates a matrix of numbers (rows x points) toward a target. Every data
 * swap — new sweep, ablation, policy reform — morphs the chart instead of
 * snapping it. Shape changes (first render, different point count) jump
 * immediately; only same-shape transitions animate.
 */
export function useAnimatedMatrix(target: number[][]): number[][] {
  const [current, setCurrent] = useState(target);
  const currentRef = useRef(target);
  currentRef.current = current;
  const frame = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    const from = currentRef.current;
    const sameShape =
      from.length === target.length &&
      from.every((row, i) => row.length === target[i].length);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!sameShape || reduceMotion) {
      setCurrent(target);
      return;
    }
    if (from === target) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = easeCubicInOut(t);
      setCurrent(
        target.map((row, i) =>
          row.map((v, j) => from[i][j] + (v - from[i][j]) * eased),
        ),
      );
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return current;
}
