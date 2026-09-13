// ArvoOS alt sayfaları ve hizmet sayfaları için ortak şablon.
import Link from "next/link";
import { ROUTES, type Locale } from "@/lib/site/routes";
import { JsonLd, breadcrumbLd, faqLd, organizationLd, serviceLd, webPageLd } from "@/lib/site/structured-data";
import type { SubContent } from "../_content/types";
import { Bento, hasBento } from "../_components/bento";
import { Check } from "../_components/marks";
import { ArvoosSubnav } from "../_components/subnav";
import { CtaBand, Faq, PageHero, SectionHead } from "../_components/ui";

export function SubView({ locale, c, homeName = "Arvo" }: { locale: Locale; c: SubContent; homeName?: string }) {
  const path = ROUTES[c.id][locale];
  const crumbs = [
    { name: homeName, href: ROUTES.home[locale] },
    ...(c.parent ? [{ name: c.parent.name, href: ROUTES[c.parent.id][locale] }] : []),
    { name: c.hero.eyebrow.split(" · ").pop() ?? c.meta.title, href: path },
  ];
  const cols = c.cards.cols ?? "three";
  return (
    <>
      <PageHero {...c.hero} crumbs={crumbs} crumbLabel={locale === "tr" ? "İçerik yolu" : "Breadcrumb"} />
      <div>
        {c.parent?.id === "arvoos" ? <ArvoosSubnav locale={locale} current={c.id} /> : null}

        <section className="section flush" aria-labelledby="cards-title">
          <div className="wrap">
            <SectionHead eyebrow={c.cards.eyebrow} title={c.cards.title} lead={c.cards.lead} split={Boolean(c.cards.lead)} id="cards-title" />
            {hasBento(c.cards.items) ? <Bento items={c.cards.items} locale={locale} numbered={c.cards.numbered} /> : <div className={`fgrid${cols === "three" ? "" : ` ${cols}`}`}>
              {c.cards.items.map((card, i) => {
                const body = (
                  <>
                    {c.cards.numbered ? <span className="fcard-n">{String(i + 1).padStart(2, "0")}</span> : null}
                    <h3>{card.title}</h3>
                    <p>{card.text}</p>
                    {card.items?.length ? <ul>{card.items.map((x) => <li key={x}><Check />{x}</li>)}</ul> : null}
                    {card.href ? <span className="link">{locale === "tr" ? "Detaylar" : "Learn more"} <span className="arrow" aria-hidden="true">→</span></span> : null}
                  </>
                );
                const st = { ["--i" as string]: i % 3 };
                return card.href
                  ? <Link key={card.title} href={card.href} className="fcard" data-reveal style={st}>{body}</Link>
                  : <article key={card.title} className="fcard" data-reveal style={st}>{body}</article>;
              })}
            </div>}
            {c.note && !c.steps ? <p className="note">{c.note}</p> : null}
          </div>
        </section>

        {c.steps ? (
          <section className="section tint" aria-labelledby="steps-title">
            <div className="wrap">
              <SectionHead eyebrow={c.steps.eyebrow} title={c.steps.title} lead={c.steps.lead} split={Boolean(c.steps.lead)} id="steps-title" />
              <ol className="proc">{c.steps.items.map((s) => <li key={s.title} data-reveal><h3>{s.title}</h3><p>{s.text}</p></li>)}</ol>
              {c.note ? <p className="note">{c.note}</p> : null}
            </div>
          </section>
        ) : null}

        {c.band ? (
          <section className="section-s">
            <div className="wrap-wide">
              <div className="band on-dark" data-reveal>
                <div>
                  {c.band.eyebrow ? <p className="eyebrow">{c.band.eyebrow}</p> : null}
                  <h2 className="h2">{c.band.title}</h2>
                  {c.band.lead ? <p className="lead">{c.band.lead}</p> : null}
                </div>
                <ul className="checks">{c.band.items.map((x) => <li key={x}><Check />{x}</li>)}</ul>
              </div>
            </div>
          </section>
        ) : null}

        <Faq eyebrow={c.faq.eyebrow} title={c.faq.title} items={c.faq.items} />
        <CtaBand eyebrow={c.cta.eyebrow} title={c.cta.title} lead={c.cta.lead} actions={c.cta.actions} />
      </div>
      <JsonLd data={[
        webPageLd({ name: c.meta.title, description: c.meta.description, path, locale }),
        breadcrumbLd(crumbs.map((x) => ({ name: x.name, path: x.href }))),
        faqLd(c.faq.items),
        ...(c.serviceName ? [serviceLd({ name: c.serviceName, description: c.meta.description, path, locale })] : []),
        ...(c.org ? [organizationLd()] : []),
      ]} />
    </>
  );
}
