"use client";
import { useEffect } from "react";

// [data-tilt] öğelerine işaretçiye göre çok hafif eğim (±2°). Yalnızca ince
// işaretçili, hover destekli cihazlarda; azaltılmış harekette kapalı.
// Tek, pasif bir belge dinleyicisi + requestAnimationFrame.
export function TiltObserver() {
  useEffect(() => {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let current: HTMLElement | null = null;
    let frame = 0;
    const reset = (el: HTMLElement | null) => { el?.style.removeProperty("--rx"); el?.style.removeProperty("--ry"); };
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(".site [data-tilt]") ?? null;
      if (current && current !== el) reset(current);
      current = el;
      if (!el) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty("--ry", `${(x * 4).toFixed(2)}deg`);
        el.style.setProperty("--rx", `${(-y * 4).toFixed(2)}deg`);
      });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => { document.removeEventListener("pointermove", onMove); cancelAnimationFrame(frame); reset(current); };
  }, []);
  return null;
}
