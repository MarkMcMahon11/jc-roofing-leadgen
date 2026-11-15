"use client";

import { useEffect } from "react";

/**
 * One pointer listener for the whole app (event delegation, throttled to animation frames):
 *  - glass panels (.pm-card) get a pool of light and a lit edge that follow the pointer
 *  - KPI tiles ([data-tilt]) also tilt in 3D toward the pointer
 * Touch input and "reduce motion" skip the tilt; nothing here is needed to use the app.
 */
export function Interactions() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let current: HTMLElement | null = null;
    let frame = 0;
    let last: PointerEvent | null = null;

    const clear = (el: HTMLElement | null) => {
      if (!el) return;
      el.classList.remove("is-lit");
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    };

    const apply = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const target = (e.target as Element | null)?.closest?.<HTMLElement>("[data-tilt], .pm-card") ?? null;
      if (target !== current) {
        clear(current);
        current = target;
      }
      if (!target) return;
      const r = target.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      target.style.setProperty("--mx", `${x}px`);
      target.style.setProperty("--my", `${y}px`);
      target.classList.add("is-lit");
      if (target.hasAttribute("data-tilt") && !reduce.matches && e.pointerType !== "touch") {
        const px = x / r.width - 0.5;
        const py = y / r.height - 0.5;
        target.style.setProperty("--ry", `${(px * 14).toFixed(2)}deg`);
        target.style.setProperty("--rx", `${(-py * 12).toFixed(2)}deg`);
      }
    };

    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      clear(current);
      current = null;
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      if (frame) cancelAnimationFrame(frame);
      clear(current);
    };
  }, []);
  return null;
}
