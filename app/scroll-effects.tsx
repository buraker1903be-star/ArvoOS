"use client";
import { useEffect } from "react";

export default function ScrollEffects() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.classList.add("motion-ready");
    const selector = [
      ".page-hero > *", ".hero > .overline", ".hero > h1", ".hero-lead", ".hero-actions", ".hero-canvas",
      ".statement > *", ".section-heading > *", ".product-card", ".eco-intro > *", ".eco-map",
      ".value-grid article", ".split-heading > *", ".service-card", ".feature-card", ".contact-card",
      ".content-section > *", ".two-col > *", ".process-step", ".cta-panel > *", ".references-heading > *", ".reference-card", ".footer-main > *", ".footer-links > div"
    ].join(",");
    const targets = Array.from(document.querySelectorAll<HTMLElement>(selector));
    targets.forEach(element => {
      element.classList.add("motion-reveal");
      const siblings = element.parentElement ? Array.from(element.parentElement.children).filter(item => item.matches(selector)) : [];
      element.style.setProperty("--motion-delay", `${Math.min(Math.max(0, siblings.indexOf(element)), 5) * 75}ms`);
      if (element.getBoundingClientRect().top < innerHeight * .92) element.classList.add("motion-visible");
    });
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("motion-visible"); observer.unobserve(entry.target);
    }), { threshold: .1, rootMargin: "0px 0px -6% 0px" });
    targets.filter(target => !target.classList.contains("motion-visible")).forEach(target => observer.observe(target));

    let frame = 0;
    const updateScroll = () => {
      cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - innerHeight;
        document.documentElement.style.setProperty("--scroll-progress", `${max > 0 ? scrollY / max * 100 : 0}%`);
        document.documentElement.style.setProperty("--hero-shift", `${Math.min(scrollY * .055, 34)}px`);
        document.body.classList.toggle("has-scrolled", scrollY > 18);
      });
    };
    const canvas = document.querySelector<HTMLElement>(".hero-canvas");
    const updatePointer = (event: PointerEvent) => {
      if (!canvas || innerWidth < 900) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
      canvas.style.setProperty("--tilt-y", `${(-7 + x * 2).toFixed(2)}deg`);
      canvas.style.setProperty("--tilt-x", `${(2 - y * 1.5).toFixed(2)}deg`);
      canvas.style.setProperty("--move-x", `${(x * 8).toFixed(2)}px`);
      canvas.style.setProperty("--move-y", `${(y * 5).toFixed(2)}px`);
    };
    updateScroll(); addEventListener("scroll", updateScroll, { passive: true }); canvas?.addEventListener("pointermove", updatePointer, { passive: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); removeEventListener("scroll", updateScroll); canvas?.removeEventListener("pointermove", updatePointer); document.documentElement.classList.remove("motion-ready"); };
  }, []);
  return <div className="scroll-progress" aria-hidden="true" />;
}
