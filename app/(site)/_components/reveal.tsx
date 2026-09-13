"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Kaydırmayla beliren öğeler ([data-reveal]).
// Tarayıcı CSS kaydırma animasyonlarını (animation-timeline: view()) destekliyorsa
// iş tamamen CSS'te (site.css) — burada hiçbir şey yapılmaz. Desteklemeyenlerde
// (ör. Firefox) küçük bir IntersectionObserver aynı etkiyi verir. Ekrandaki
// öğeler aynı karede görünür işaretlenir, böylece ilk boyamada yanıp sönme olmaz.
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()")) return;
    const targets = Array.from(document.querySelectorAll<HTMLElement>(".site [data-reveal]"));
    root.classList.add("reveal-js");
    targets.forEach((el) => {
      if (el.getBoundingClientRect().top < innerHeight * 0.95) el.classList.add("is-in");
    });
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }),
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    targets.filter((el) => !el.classList.contains("is-in")).forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
