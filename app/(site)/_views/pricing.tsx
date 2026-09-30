// Ücretler sayfası (TR + EN aynı görünümü kullanır). Tutarlar yalnızca
// lib/site/pricing.ts'ten; metin _content/pricing(-en).ts'ten gelir.
import Link from "next/link";
import { ROUTES, type Locale } from "@/lib/site/routes";
import { PLANS, ADD_ONS, tutarYaz, yillikKurus, urunAdi, urunAdresi } from "@/lib/site/pricing";
import { JsonLd, breadcrumbLd, faqLd, pricingLd, webPageLd } from "@/lib/site/structured-data";
import type { PricingContent } from "../_content/types";
import { Check } from "../_components/marks";
import { PriceCycle } from "../_components/price-cycle";
import { Actions, CtaBand, Faq, PageHero, SectionHead } from "../_components/ui";

const planByCode = new Map(PLANS.map((p) => [p.code, p]));
const addOnByCode = new Map(ADD_ONS.map((a) => [a.code, a]));

/** Tutar + birim. Teklif usulü basamakta rakam yerine "Teklif" yazılır. */
function Fiyat({ kurus, suffix, locale }: { kurus: number; suffix: string; locale: Locale }) {
  return (
    <>
      <b>{tutarYaz(kurus, locale)} TL</b>
      <small>{suffix}</small>
    </>
  );
}

export function PricingView({ locale, c }: { locale: Locale; c: PricingContent }) {
  const tr = locale === "tr";
  const path = ROUTES.pricing[locale];
  const crumbs = [
    { name: "Arvo", href: ROUTES.home[locale] },
    { name: c.meta.title, href: path },
  ];

  return (
    <>
      <PageHero {...c.hero} crumbs={crumbs} crumbLabel={tr ? "İçerik yolu" : "Breadcrumb"} />

      <div className="scenes pricing-page">
        <section className="section" aria-labelledby="ucret-title">
          <div className="wrap">
            <h2 className="sr-only" id="ucret-title">{c.meta.title}</h2>
            <PriceCycle
              monthly={c.cycle.monthly}
              yearly={c.cycle.yearly}
              badge={c.cycle.badge}
              label={tr ? "Ödeme dönemi" : "Billing period"}
              productsLabel={tr ? "Ürün" : "Product"}
              products={c.groups.map((g) => ({ code: g.product, label: urunAdi(g.product) }))}
            >
              <p className="vat-note">{c.vatNote}</p>

              {c.groups.map((group) => {
                const link = urunAdresi(group.product, locale);
                return (
                  <section className="pgroup" data-urun={group.product} key={group.product} aria-labelledby={`pg-${group.product}`}>
                    <div className="pgroup-head" data-reveal>
                      <div>
                        <p className="eyebrow">{group.tag}</p>
                        <h3 className="h2" id={`pg-${group.product}`}>{urunAdi(group.product)}</h3>
                        <p className="lead">{group.lead}</p>
                      </div>
                      {link.external
                        ? <a className="link" href={link.href} target="_blank" rel="noopener">{group.linkLabel} ›</a>
                        : <Link className="link" href={link.href}>{group.linkLabel} ›</Link>}
                    </div>

                    <div className="fgrid">
                      {group.cards.map((card, i) => {
                        const plan = planByCode.get(card.code);
                        if (!plan) return null;
                        const yillik = yillikKurus(plan);
                        return (
                          <article
                            key={card.code}
                            className="fcard pcard"
                            data-featured={plan.oneCikan || undefined}
                            data-reveal
                            style={{ ["--i" as string]: i % 3 }}
                          >
                            <h4>{plan.ad[locale]}</h4>
                            {plan.aylikKurus === null || yillik === null ? (
                              <p className="price"><span className="price-quote">{c.cycle.quote}</span></p>
                            ) : (
                              <p className="price">
                                <span className="price-m"><Fiyat kurus={plan.aylikKurus} suffix={plan.kisiBasi ? c.cycle.perMonthUser : c.cycle.perMonth} locale={locale} /></span>
                                <span className="price-y"><Fiyat kurus={yillik} suffix={plan.kisiBasi ? c.cycle.perYearUser : c.cycle.perYear} locale={locale} /></span>
                              </p>
                            )}
                            <p>{card.text}</p>
                            <ul>{card.items.map((x) => <li key={x}><Check />{x}</li>)}</ul>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </PriceCycle>
          </div>
        </section>

        <section className="section" aria-labelledby="addon-title">
          <div className="wrap">
            <SectionHead eyebrow={c.addOns.eyebrow} title={c.addOns.title} lead={c.addOns.lead} split id="addon-title" />
            {/* Kart yerine satır: dört ek kalem, dört kutu kadar yer kaplamasın. */}
            <dl className="addon-list" data-reveal>
              {c.addOns.items.map((item) => {
                const addOn = addOnByCode.get(item.code);
                return (
                  <div className="addon-row" key={item.code}>
                    <dt>{item.name}</dt>
                    <dd className="addon-price">
                      {addOn?.aylikKurus
                        ? <><b>{tutarYaz(addOn.aylikKurus, locale)} TL</b><small>{c.cycle.perMonth}</small></>
                        : <span className="price-quote">{c.addOns.quote}</span>}
                    </dd>
                    <dd className="addon-text">{item.text}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </section>

        {/* Koşullar: kahraman bölümündeki "Abonelik koşulları" bağlantısı buraya iner. */}
        <section className="section tint" id="kosullar" aria-labelledby="policy-title">
          <div className="wrap">
            <SectionHead eyebrow={c.policy.eyebrow} title={c.policy.title} lead={c.policy.lead} split id="policy-title" />
            <dl className="policy-list" data-reveal>
              {c.policy.items.map((item) => (
                <div key={item.title}>
                  <dt>{item.title}</dt>
                  <dd>{item.text}</dd>
                </div>
              ))}
            </dl>
            <Actions items={c.policy.links} className="policy-links" />
          </div>
        </section>

        <Faq eyebrow={c.faq.eyebrow} title={c.faq.title} items={c.faq.items} />
        <CtaBand title={c.cta.title} lead={c.cta.lead} actions={c.cta.actions} />
      </div>

      <JsonLd data={[
        webPageLd({ name: c.meta.title, description: c.meta.description, path, locale }),
        breadcrumbLd(crumbs.map((x) => ({ name: x.name, path: x.href }))),
        faqLd(c.faq.items),
        ...pricingLd(locale),
      ]} />
    </>
  );
}
