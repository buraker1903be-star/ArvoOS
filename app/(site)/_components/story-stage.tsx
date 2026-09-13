"use client";
// Apple tarzı sabitlenmiş anlatı: adımlar kaydıkça yapışkan pencere durum
// değiştirir (IntersectionObserver + CSS geçişleri). Mobilde ve azaltılmış
// harekette her adım kendi ekranıyla alt alta gösterilir (site-story.css).
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/site/routes";
import { FLOW_COPY } from "../_content/flow-copy";
import { FLOW_STATES, FlowScreen } from "./flow-screens";

export function StoryStage({ locale, eyebrow, title, lead, steps, footer, id = "story-title" }: {
  locale: Locale; eyebrow?: string; title: string; lead?: string; steps: { title: string; text: string }[]; footer?: ReactNode; id?: string;
}) {
  const copy = FLOW_COPY[locale];
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const count = Math.min(steps.length, FLOW_STATES);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i)); }),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section className="section flowx" aria-labelledby={id}>
      <div className="wrap flowx-grid">
        <div className="flowx-copy">
          <div className="flowx-head">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2 id={id} className="h2">{title}</h2>
            {lead ? <p className="lead">{lead}</p> : null}
          </div>
          <ol className="flowx-steps">
            {steps.slice(0, count).map((s, i) => (
              <li key={s.title} ref={(el) => { items.current[i] = el; }} data-i={i} data-on={i === active || undefined}>
                <span className="flowx-n">{String(i + 1).padStart(2, "0")}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <div className="flowx-inline mock-win" aria-hidden="true"><FlowScreen index={i} copy={copy} /></div>
              </li>
            ))}
          </ol>
          {footer ? <div className="flowx-foot">{footer}</div> : null}
        </div>
        <div className="flowx-stage" aria-hidden="true">
          <div className="flowx-sticky">
            <div className="mock-win flowx-win">
              <div className="mock-chrome"><i /><i /><i /><span className="mock-url">{copy.url}</span></div>
              <div className="flowx-screens">
                {Array.from({ length: count }, (_, i) => (
                  <div key={i} className="fx-screen" data-on={i === active || undefined}><FlowScreen index={i} copy={copy} /></div>
                ))}
              </div>
            </div>
            <div className="flowx-dots">{Array.from({ length: count }, (_, i) => <i key={i} data-on={i === active || undefined} />)}</div>
            <p className="mock-cap">{copy.cap}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
