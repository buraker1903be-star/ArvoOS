// Ürün sayfası şablonu (ArvoOS, ArvoLab, Arc) — açık açılış + keskin beyaz/gri sahneler.
import Link from "next/link";
import { ROUTES, type Locale } from "@/lib/site/routes";
import { JsonLd, breadcrumbLd, faqLd, productLd, webPageLd } from "@/lib/site/structured-data";
import type { ProductContent } from "../_content/types";
import { Bento, hasBento } from "../_components/bento";
import { HeroStage } from "../_components/hero-stage";
import { Check, ProductLogo, type ProductName } from "../_components/marks";
import { StoryStage } from "../_components/story-stage";
import { ArvoosSubnav } from "../_components/subnav";
import { Actions, CtaBand, Faq, PageHero, SectionHead } from "../_components/ui";

export function ProductView({ locale, c }: { locale: Locale; c: ProductContent }) {
  const path = ROUTES[c.id][locale];
  const crumbs = [{ name: "Arvo", href: ROUTES.home[locale] }, { name: c.name, href: path }];
  return (
    <>
      <PageHero {...c.hero} crumbs={crumbs} crumbLabel={locale === "tr" ? "İçerik yolu" : "Breadcrumb"} logo={<ProductLogo name={c.name as ProductName} height={40} />}>
        <HeroStage locale={locale} product={c.id} />
      </PageHero>
      {c.id === "arvoos" ? <ArvoosSubnav locale={locale} current="arvoos" /> : null}

      <div className="scenes">
        <section className="section" aria-labelledby="features-title">
          <div className="wrap">
            <SectionHead eyebrow={c.features.eyebrow} title={c.features.title} lead={c.features.lead} split id="features-title" />
            {hasBento(c.features.items) ? <Bento items={c.features.items} locale={locale} /> : (
              <div className="fgrid">
                {c.features.items.map((f, i) => (
                  <article key={f.title} className="fcard" data-reveal style={{ ["--i" as string]: i % 3 }}><span className="fcard-n">{String(i + 1).padStart(2, "0")}</span><h3>{f.title}</h3><p>{f.text}</p></article>
                ))}
              </div>
            )}
          </div>
        </section>

        {c.flow && c.id === "arvoos" ? (
          <StoryStage locale={locale} eyebrow={c.flow.eyebrow} title={c.flow.title} lead={c.flow.lead} steps={c.flow.steps} id="flow-title" footer={c.flow.cta ? <Actions items={[c.flow.cta]} /> : null} />
        ) : c.flow ? (
          <section className="section" aria-labelledby="flow-title">
            <div className="wrap story">
              <div className="story-pin">
                <p className="eyebrow">{c.flow.eyebrow}</p>
                <h2 id="flow-title" className="h2" style={{ marginTop: 8 }}>{c.flow.title}</h2>
                {c.flow.lead ? <p className="lead">{c.flow.lead}</p> : null}
              </div>
              <ol className="steps">
                {c.flow.steps.map((s, i) => <li key={s.title} className="step" data-reveal style={{ ["--i" as string]: i % 3 }}><span className="step-n">{String(i + 1).padStart(2, "0")}</span><div><h3>{s.title}</h3><p>{s.text}</p></div></li>)}
              </ol>
            </div>
          </section>
        ) : null}

        <section className="section" aria-labelledby="aud-title">
          <div className="wrap">
            <SectionHead eyebrow={c.audience.eyebrow} title={c.audience.title} lead={c.audience.lead} split id="aud-title" />
            <div className="aud">
              {c.audience.items.map((a, i) => a.href
                ? <Link key={a.title} href={a.href} data-reveal style={{ ["--i" as string]: i % 4 }}><h3>{a.title}</h3><p>{a.text}</p><span className="link">{c.audience.more} ›</span></Link>
                : <div key={a.title} data-reveal style={{ ["--i" as string]: i % 4 }}><h3>{a.title}</h3><p>{a.text}</p></div>)}
            </div>
          </div>
        </section>

        {c.band ? (
          <section className="section-s">
            <div className="wrap">
              <div className="band" data-reveal>
                <div>
                  {c.band.eyebrow ? <p className="eyebrow">{c.band.eyebrow}</p> : null}
                  <h2 className="h2">{c.band.title}</h2>
                  {c.band.lead ? <p className="lead">{c.band.lead}</p> : null}
                </div>
                {c.band.items.length ? <ul className="checks">{c.band.items.map((x) => <li key={x}><Check />{x}</li>)}</ul> : null}
              </div>
            </div>
          </section>
        ) : null}

        <Faq eyebrow={c.faq.eyebrow} title={c.faq.title} items={c.faq.items} />
        <CtaBand eyebrow={c.cta.eyebrow} title={c.cta.title} lead={c.cta.lead} actions={c.cta.actions} />
      </div>
      <JsonLd data={[
        productLd({ name: c.name, description: c.meta.description, path, appUrl: c.appUrl, category: c.category, locale, features: c.featureList }),
        webPageLd({ name: c.meta.title, description: c.meta.description, path, locale }),
        breadcrumbLd(crumbs.map((x) => ({ name: x.name, path: x.href }))),
        faqLd(c.faq.items),
      ]} />
    </>
  );
}
