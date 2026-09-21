import { ROUTES, type Locale, type PageId } from "@/lib/site/routes";
import { JsonLd, breadcrumbLd, webPageLd } from "@/lib/site/structured-data";
import type { PrivacyContent } from "../_content/privacy";
import { PageHero } from "../_components/ui";

/*
  Hukuki metin şablonu (mesafeli satış, iptal-iade, teslimat). PrivacyView ile
  aynı düzen, farkı rotayı sabit tutmaması: aynı görünüm üç sayfaya hizmet
  ediyor, yeni bir hukuki sayfa yalnızca içerik + rota ekleyerek geliyor.
*/
export function LegalView({ locale, id, c }: { locale: Locale; id: PageId; c: PrivacyContent }) {
  const path = ROUTES[id][locale];
  const crumbs = [{ name: "Arvo", href: ROUTES.home[locale] }, { name: c.hero.eyebrow, href: path }];
  return (
    <>
      <PageHero {...c.hero} crumbs={crumbs} crumbLabel={locale === "tr" ? "İçerik yolu" : "Breadcrumb"} />
      <div className="scenes">
        <section className="section">
          <article className="wrap-narrow prose">
            <p className="meta">{c.updated}</p>
            {c.sections.map((s, i) => (
              <section key={s.h || `b${i}`}>
                {/* Başlıksız bölüm: bir önceki başlığın altına giren ek paragraf. */}
                {s.h ? <h2>{s.h}</h2> : null}
                {s.p?.map((p) => <p key={p}>{p}</p>)}
                {s.list ? <ul>{s.list.map((li) => <li key={li}>{li}</li>)}</ul> : null}
              </section>
            ))}
          </article>
        </section>
      </div>
      <JsonLd data={[webPageLd({ name: c.meta.title, description: c.meta.description, path, locale }), breadcrumbLd(crumbs.map((x) => ({ name: x.name, path: x.href })))]} />
    </>
  );
}
