import { useEffect, useRef, useState } from "react";

export const MATRIX_DURATION_MS = 650;
const DURATION_MS = MATRIX_DURATION_MS;

export const easeCubicInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Animates a matrix of numbers (rows x points) toward a target. Every data
 * swap — new sweep, ablation, policy reform — morphs the chart instead of
 * snapping it. Shape changes (first render, different point count) jump
 * immediately; only same-shape transitions animate.
 *
 * `jumpKey`: when this changes alongside the target, the swap snaps instead
 * of tweening. The sweep map keys it on the axis window — after a zoom,
 * index i is a *different income* in the old and new arrays, so value-wise
 * morphing draws curves that never existed; the domain tween and the
 * fading old-map ghost carry that transition instead.
 */
export function useAnimatedMatrix(
  target: number[][],
  jumpKey?: unknown,
): number[][] {
  const [current, setCurrent] = useState(target);
  const currentRef = useRef(target);
  currentRef.current = current;
  const frame = useRef(0);
  const lastJumpKey = useRef(jumpKey);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    const keyChanged = lastJumpKey.current !== jumpKey;
    lastJumpKey.current = jumpKey;
    const from = currentRef.current;
    const sameShape =
      from.length === target.length &&
      from.every((row, i) => row.length === target[i].length);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!sameShape || keyChanged || reduceMotion) {
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
