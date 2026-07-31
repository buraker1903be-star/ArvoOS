"use client";

import { useEffect } from "react";

export default function ScrollEffects() {
  useEffect(() => {
    const revealTargets = document.querySelectorAll(
      ".section, .formula, .modulegrid article, .sectorgrid article, .insight, .price, .democard"
    );

    revealTargets.forEach((element, index) => {
      element.classList.add("reveal");
      if (element.matches("article")) {
        (element as HTMLElement).style.setProperty("--reveal-delay", `${(index % 3) * 90}ms`);
      }
    });

    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -7% 0px" }
    );

    revealTargets.forEach(element => observer.observe(element));

    const onScroll = () => {
      const maximum = document.documentElement.scrollHeight - innerHeight;
      const progress = maximum > 0 ? scrollY / maximum : 0;
      document.documentElement.style.setProperty("--scroll-progress", `${progress * 100}%`);
      document.documentElement.style.setProperty("--hero-shift", `${Math.min(scrollY * 0.08, 42)}px`);
      document.body.classList.toggle("has-scrolled", scrollY > 18);
    };

    const stage = document.querySelector<HTMLElement>(".stage");
    const onPointerMove = (event: PointerEvent) => {
      if (!stage || innerWidth < 900) return;
      const x = (event.clientX / innerWidth - 0.5) * 10;
      const y = (event.clientY / innerHeight - 0.5) * 8;
      stage.style.setProperty("--tilt-x", `${y}deg`);
      stage.style.setProperty("--tilt-y", `${-x}deg`);
    };

    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      observer.disconnect();
      removeEventListener("scroll", onScroll);
      removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return <div className="scroll-progress" aria-hidden="true" />;
}
