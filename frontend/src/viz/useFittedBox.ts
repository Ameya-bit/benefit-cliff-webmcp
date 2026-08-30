import { useEffect, useState, type RefObject } from "react";

/** Matches the App.css stacked-layout breakpoint: below it the chart boxes
 * take their height from the viewBox (height: auto), so fitting would chase
 * its own tail — the fallback height is returned instead. */
const STACKED_BP = "(max-width: 1000px)";

/**
 * ViewBox height that matches the element's CSS box aspect, for SVGs with a
 * fixed design width. With the aspect matched the SVG draws with no
 * letterboxing and near 1:1 design-unit-to-pixel scale, so in-chart type
 * renders at page-type sizes (the 9A scale-system fix).
 */
export function useFittedHeight(
  ref: RefObject<SVGSVGElement | null>,
  designW: number,
  fallbackH: number,
  minH = 200,
  maxH = 560,
): number {
  const [height, setHeight] = useState(fallbackH);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia(STACKED_BP);

    const measure = () => {
      if (mq.matches) {
        setHeight(fallbackH);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const fitted = (designW * rect.height) / rect.width;
      setHeight(Math.round(Math.min(maxH, Math.max(minH, fitted))));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    mq.addEventListener("change", measure);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", measure);
    };
  }, [ref, designW, fallbackH, minH, maxH]);

  return height;
}

/**
 * The element's CSS box in pixels, for SVGs that set their whole viewBox
 * from it (scale exactly 1 — viewBox units are pixels). Stable while the
 * box is layout-sized; on stacked layouts (height: auto) the box height
 * already follows the viewBox, so re-measuring is an identity map.
 */
export function useMeasuredBox(
  ref: RefObject<SVGSVGElement | null>,
  fallback: { w: number; h: number },
): { w: number; h: number } {
  const [box, setBox] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      setBox((prev) => {
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        return prev.w === w && prev.h === h ? prev : { w, h };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return box;
}
