// Ortak sunum parçaları (sunucu bileşenleri) — tamamen açık tema.
import Link from "next/link";
import type { ReactNode } from "react";

export type Cta = { label: string; href: string; external?: boolean; variant?: "gold" | "ghost" | "primary" };

export function CtaLink({ cta, className = "" }: { cta: Cta; className?: string }) {
  const cls = `btn btn-${cta.variant ?? "primary"} ${className}`.trim();
  if (cta.href.startsWith("mailto:")) return <a className={cls} href={cta.href}>{cta.label}</a>;
  return cta.external
    ? <a className={cls} href={cta.href} target="_blank" rel="noopener">{cta.label}</a>
    : <Link className={cls} href={cta.href}>{cta.label}</Link>;
}

export function Actions({ items, className = "" }: { items: Cta[]; className?: string }) {
  return <div className={`actions ${className}`.trim()}>{items.map((c) => <CtaLink key={c.href + c.label} cta={c} />)}</div>;
}

export function Crumbs({ items, label }: { items: { name: string; href: string }[]; label: string }) {
  return (
    <nav className="crumbs rise" aria-label={label}>
      <ol>{items.map((c, i) => <li key={c.href}>{i === items.length - 1 ? <span aria-current="page">{c.name}</span> : <Link href={c.href}>{c.name}</Link>}</li>)}</ol>
    </nav>
  );
}

/** Alt sayfaların açık açılışı. children: sahne (ör. katmanlı arayüz). */
export function PageHero({
  eyebrow, title, subtitle, lead, actions = [], crumbs, crumbLabel = "Breadcrumb", center = false, logo, children,
}: {
  eyebrow: string; title: string; subtitle?: string; lead: string; actions?: Cta[];
  crumbs?: { name: string; href: string }[]; crumbLabel?: string; center?: boolean; logo?: ReactNode; children?: ReactNode;
}) {
  const d = (n: number) => ({ ["--d" as string]: n });
  // Sahnesi olmayan açılışlar ortalanır; sola yaslı metin sağ yarıyı boş bırakıyordu.
  const centered = center || !children;
  return (
    <section className={`phero${centered ? " center" : ""}`}>
      <div className="wrap">
        {crumbs ? <Crumbs items={crumbs} label={crumbLabel} /> : null}
        {logo ? <div className="phero-logo rise" style={d(1)}>{logo}</div> : null}
        <p className="eyebrow rise" style={d(1)}>{eyebrow}</p>
        <h1 className="h1 rise" style={d(2)}>{title}{subtitle ? <span className="grey-text"> {subtitle}</span> : null}</h1>
        <p className="lead rise" style={d(3)}>{lead}</p>
        {actions.length ? <Actions items={actions} className="rise" /> : null}
      </div>
      {children ?? null}
    </section>
  );
}

export function SectionHead({ eyebrow, title, lead, center = false, split = false, id }: { eyebrow?: string; title: string; lead?: string; center?: boolean; split?: boolean; id?: string }) {
  return (
    <div className={`shead${center ? " center" : ""}${split ? " split" : ""}`} data-reveal>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="h2" id={id}>{title}</h2>
      </div>
      {lead ? <p className="lead">{lead}</p> : null}
    </div>
  );
}

export type QA = { q: string; a: string };

export function Faq({ eyebrow, title, items }: { eyebrow?: string; title: string; items: QA[] }) {
  return (
    <section className="section" aria-labelledby="faq-title">
      <div className="wrap-narrow">
        <SectionHead eyebrow={eyebrow} title={title} id="faq-title" />
        <div className="faq">
          {items.map((item) => (
            <details key={item.q}>
              <summary><h3>{item.q}</h3><span className="faq-icon" aria-hidden="true" /></summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CtaBand({ eyebrow, title, lead, actions, note }: { eyebrow?: string; title: string; lead?: string; actions: Cta[]; note?: ReactNode }) {
  return (
    <section className="cta">
      <div className="wrap center" data-reveal>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="h2 cta-title">{title}</h2>
        {lead ? <p className="lead measure" style={{ marginTop: 16 }}>{lead}</p> : null}
        <Actions items={actions} className="center cta-actions" />
        {note ? <p className="cta-note">{note}</p> : null}
      </div>
    </section>
  );
}
