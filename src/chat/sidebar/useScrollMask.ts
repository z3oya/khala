/* Three-state data attribute for the 24px scroll fade mask; rAF-scheduled. */
import { useEffect, useState, type RefObject } from "react";

export type ScrollMask = "none" | "top" | "bottom" | "both";

export function useScrollMask(ref: RefObject<HTMLDivElement | null>): ScrollMask {
  const [mask, setMask] = useState<ScrollMask>("none");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const scrollable = el.scrollHeight > el.clientHeight + 1;
      const top = el.scrollTop > 1;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setMask(!scrollable ? "none" : top && bottom ? "both" : top ? "top" : bottom ? "bottom" : "none");
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
  return mask;
}
