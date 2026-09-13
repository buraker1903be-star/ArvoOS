import { ROUTES, type Locale } from "@/lib/site/routes";
import { JsonLd, breadcrumbLd, webPageLd } from "@/lib/site/structured-data";
import type { PrivacyContent } from "../_content/privacy";
import { PageHero } from "../_components/ui";

export function PrivacyView({ locale, c }: { locale: Locale; c: PrivacyContent }) {
  const path = ROUTES.privacy[locale];
  const crumbs = [{ name: "Arvo", href: ROUTES.home[locale] }, { name: c.hero.eyebrow, href: path }];
  return (
    <>
      <PageHero {...c.hero} crumbs={crumbs} crumbLabel={locale === "tr" ? "İçerik yolu" : "Breadcrumb"} />
      <section className="section flush">
        <article className="wrap-narrow prose">
          <p className="meta">{c.updated}</p>
          {c.sections.map((s) => (
            <section key={s.h}>
              <h2>{s.h}</h2>
              {s.p?.map((p) => <p key={p}>{p}</p>)}
              {s.list ? <ul>{s.list.map((li) => <li key={li}>{li}</li>)}</ul> : null}
            </section>
          ))}
        </article>
      </section>
      <JsonLd data={[webPageLd({ name: c.meta.title, description: c.meta.description, path, locale }), breadcrumbLd(crumbs.map((x) => ({ name: x.name, path: x.href })))]} />
    </>
  );
}
