import Link from "next/link";
import { LeadForm } from "@/app/_site/lead-form";
import { LEAD_INTERESTS, type LeadInterest } from "@/app/_site/lead-types";
import { COMPANY, PRODUCT_APPS, ROUTES, type Locale } from "@/lib/site/routes";
import { JsonLd, breadcrumbLd, faqLd, webPageLd } from "@/lib/site/structured-data";
import type { ContactContent } from "../_content/contact";
import { Faq, PageHero } from "../_components/ui";

const ALIASES: Record<string, LeadInterest> = {
  hizmetler: "services", hizmet: "services", web: "services", seo: "services", yazilim: "services", software: "services",
  os: "arvoos", lab: "arvolab", diger: "other",
};

/** ?ilgi= / ?interest= değerini formun ilgi alanına çevirir (bilinmeyen → arvoos). */
export function toInterest(raw: string | string[] | undefined): LeadInterest {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase().trim() ?? "";
  if ((LEAD_INTERESTS as readonly string[]).includes(v)) return v as LeadInterest;
  return ALIASES[v] ?? "arvoos";
}

export function ContactView({ locale, c, interest }: { locale: Locale; c: ContactContent; interest: LeadInterest }) {
  const path = ROUTES.contact[locale];
  const crumbs = [{ name: "Arvo", href: ROUTES.home[locale] }, { name: c.hero.eyebrow, href: path }];
  return (
    <>
      <PageHero {...c.hero} crumbs={crumbs} crumbLabel={locale === "tr" ? "İçerik yolu" : "Breadcrumb"} />
      <section className="section flush" aria-labelledby="form-title">
        <div className="wrap contact">
          <div>
            <h2 id="form-title" className="h2">{c.formTitle}</h2>
            <p className="lead" style={{ marginTop: 16 }}>{c.formLead}</p>
            <div className="contact-aside" style={{ marginTop: 40 }}>
              <div><small>{c.emailLabel}</small><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></div>
              <div><small>{c.addressLabel}</small><p>{COMPANY.legalName}<br /><span style={{ fontWeight: 400, color: "var(--muted)" }}>{COMPANY.address.display}</span></p></div>
              <div>
                <small>{c.appsLabel}</small>
                {(["arvoos", "arvolab", "arc"] as const).map((k) => <a key={k} href={PRODUCT_APPS[k].url} target="_blank" rel="noopener">{PRODUCT_APPS[k].name} · {PRODUCT_APPS[k].host} ↗</a>)}
              </div>
              <div><small>{c.privacyLabel}</small><Link href={ROUTES.privacy[locale]} style={{ fontWeight: 500, fontSize: 15 }}>{c.privacyText} →</Link></div>
            </div>
          </div>
          <div className="form-card" id="form">
            <LeadForm locale={locale} defaultInterest={interest} theme="light" />
          </div>
        </div>
      </section>
      <Faq eyebrow={c.faq.eyebrow} title={c.faq.title} items={c.faq.items} />
      <JsonLd data={[webPageLd({ name: c.meta.title, description: c.meta.description, path, locale }), breadcrumbLd(crumbs.map((x) => ({ name: x.name, path: x.href }))), faqLd(c.faq.items)]} />
    </>
  );
}
