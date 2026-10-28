// Ana sayfa — apple.com düzeni: açık açılış (3B kaydırma açılışı), tam
// genişlikte ürün kutuları, ArvoOS akış sahnesi, yarım genişlik hizmet
// kutuları, referanslar, SSS ve açık kapanış. Sahneler beyaz / gri keskin.
import Link from "next/link";
import type { ReactNode } from "react";
import { COMPANY, ROUTES, type Locale } from "@/lib/site/routes";
import { JsonLd, faqLd, organizationLd, webPageLd, websiteLd } from "@/lib/site/structured-data";
import type { HomeContent } from "../_content/home";
import { Fragment } from "../_components/frags";
import { HeroStage } from "../_components/hero-stage";
import { BrandLogo, ProductLogo, type ProductName } from "../_components/marks";
import { FloatCard } from "../_components/float-card";
import { LabMock } from "../_components/mock-lab";
import { StoryStage } from "../_components/story-stage";
import { ArvoosTrio } from "../_components/trio";
import { Actions, CtaBand, Faq, SectionHead } from "../_components/ui";
import { KISA } from "../_content/kisa";

const d = (n: number) => ({ ["--d" as string]: n });

function ProductTile({ id, name, kicker, title, sub, href, app, more, signIn, narrow, children }: {
  id?: string; name: ProductName; kicker: string; title: string; sub: string; href: string; app: string; more: string; signIn: string; narrow?: boolean; children: ReactNode;
}) {
  const hid = `pt-${name.toLowerCase()}`;
  return (
    <section className="ptile" id={id} aria-labelledby={hid}>
      <div className="wrap ptile-copy" data-reveal>
        <ProductLogo name={name} height={40} />
        <p className="ptile-kicker">{kicker}</p>
        <h2 id={hid} className="ptile-title">{title}</h2>
        <p className="ptile-sub">{sub}</p>
        <div className="ptile-links">
          <Link className="alink" href={href}>{more}</Link>
          <a className="alink" href={app} target="_blank" rel="noopener">{signIn}</a>
        </div>
      </div>
      <div className={`ptile-visual${narrow ? " narrow" : ""}`}><div className="lift"><div data-tilt>{children}</div></div></div>
    </section>
  );
}

const BOOK_CARD = {
  tr: { kicker: "Yeni randevu", status: "Onaylandı", title: "Saç kesimi · Elif", sub: "Perşembe 14:30 · 45 dk", rows: [["Personel takvimi uygun", "ok"], ["Müşteriye bildirim hazır", "ok"]] as [string, "ok" | "warn"][] },
  en: { kicker: "New booking", status: "Confirmed", title: "Haircut · Elif", sub: "Thursday 2:30 pm · 45 min", rows: [["Stylist calendar free", "ok"], ["Customer notice ready", "ok"]] as [string, "ok" | "warn"][] },
  de: { kicker: "Neuer Termin", status: "Bestätigt", title: "Haarschnitt · Elif", sub: "Donnerstag 14:30 · 45 Min.", rows: [["Kalender der Mitarbeiterin frei", "ok"], ["Kundenbenachrichtigung bereit", "ok"]] as [string, "ok" | "warn"][] },
  es: { kicker: "Nueva cita", status: "Confirmada", title: "Corte de pelo · Elif", sub: "Jueves 14:30 · 45 min", rows: [["Agenda de la estilista libre", "ok"], ["Aviso al cliente listo", "ok"]] as [string, "ok" | "warn"][] },
  fr: { kicker: "Nouveau rendez-vous", status: "Confirmé", title: "Coupe · Elif", sub: "Jeudi 14 h 30 · 45 min", rows: [["Agenda de la coiffeuse libre", "ok"], ["Notification client prête", "ok"]] as [string, "ok" | "warn"][] },
} as const;

export function HomeView({ locale, c }: { locale: Locale; c: HomeContent }) {
  const { os, lab, book } = c.products;
  const more = KISA[locale].more;
  const signIn = KISA[locale].signIn;
  const visuals = ["web", "seo", "software"] as const;
  return (
    <>
      <section className="lhero" aria-labelledby="hero-title">
        <div className="wrap lhero-copy">
          <p className="eyebrow rise" style={d(0)}>{c.hero.eyebrow}</p>
          <h1 id="hero-title" className="display rise" style={d(1)}>{c.hero.title}{c.hero.subtitle ? <span className="thin"> {c.hero.subtitle}</span> : null}</h1>
          <p className="lead rise" style={d(2)}>{c.hero.lead}</p>
          <Actions items={c.hero.actions} className="rise" />
        </div>
        <HeroStage locale={locale} />
      </section>

      <div className="scenes">
        <ProductTile id={KISA[locale].productsAnchor} name="ArvoOS" kicker={os.label} title={os.title} sub={os.text} href={os.cta.href} app={os.signIn.href} more={more} signIn={signIn}>
          <ArvoosTrio locale={locale} />
        </ProductTile>

        <StoryStage locale={locale} eyebrow={c.story.eyebrow} title={c.story.title} lead={c.story.lead} steps={c.story.steps} footer={<Actions items={[c.story.cta]} />} />

        <ProductTile name="ArvoLab" kicker={lab.label} title={lab.title} sub={lab.text} href={lab.cta.href} app={lab.signIn.href} more={more} signIn={signIn} narrow>
          <LabMock locale={locale} />
        </ProductTile>

        {/* ArvoARC'ın yeri 28.10.2026'dan beri ArvoBook: ARC satılmıyor. Arayüz
            maketi henüz yok; mevcut yüzen kart örnek bir randevuyla çiziliyor. */}
        <ProductTile name="ArvoBook" kicker={book.label} title={book.title} sub={book.text} href={book.cta.href} app={book.signIn.href} more={more} signIn={signIn} narrow>
          <div className="ptile-card"><FloatCard {...BOOK_CARD[locale]} /></div>
        </ProductTile>

        <section className="section" aria-labelledby="svc-title">
          <div className="wrap">
            <SectionHead eyebrow={c.services.eyebrow} title={c.services.title} lead={c.services.lead} center id="svc-title" />
            <div className="halves">
              {c.services.items.map((s, i) => (
                <article key={s.href} className="half" data-reveal style={{ ["--i" as string]: i % 2 }}>
                  <small>{s.tag}</small>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                  <Link className="alink" href={s.href}>{more}</Link>
                  <div className="half-visual" aria-hidden="true"><Fragment v={visuals[i] ?? "web"} locale={locale} /></div>
                </article>
              ))}
              <article className="half" data-reveal style={{ ["--i" as string]: 1 }}>
                <small>{c.services.eyebrow}</small>
                <h3>{c.services.all.title}</h3>
                <p>{c.services.all.text}</p>
                <Link className="alink" href={c.services.cta.href}>{c.services.cta.label}</Link>
                <div className="half-list">{c.services.all.items.map((x) => <Link key={x} href={c.services.cta.href}>{x}</Link>)}</div>
              </article>
            </div>
          </div>
        </section>

        <section className="section-s" aria-labelledby="refs-title">
          <div className="wrap">
            <SectionHead eyebrow={c.refs.eyebrow} title={c.refs.title} center id="refs-title" />
            <div className="refs">
              <a className="ref" href="https://arvoculture.com" target="_blank" rel="noopener" data-reveal>
                <BrandLogo brand="arvoculture" alt="ArvoCulture Group" />
                <span>{c.refs.culture} ↗</span>
              </a>
              <a className="ref" href="https://akademikmerkez.com" target="_blank" rel="noopener" data-reveal>
                {/* Harici logo: next/image uzak kaynak yapılandırması olmadığı için düz img (boyutlu, tembel yükleme). */}
                <img src="https://akademikmerkez.com/logo-trimmed.png" alt="AkademikMerkez" width={840} height={260} loading="lazy" decoding="async" />
                <span>{c.refs.akademik} ↗</span>
              </a>
            </div>
          </div>
        </section>

        <Faq eyebrow={c.faq.eyebrow} title={c.faq.title} items={c.faq.items} />

        <CtaBand eyebrow={c.cta.eyebrow} title={c.cta.title} lead={c.cta.lead} actions={c.cta.actions} note={<>{c.cta.note} <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></>} />
      </div>

      <JsonLd data={[organizationLd(), websiteLd(locale), webPageLd({ name: c.meta.title, description: c.meta.description, path: ROUTES.home[locale], locale }), faqLd(c.faq.items)]} />
    </>
  );
}
