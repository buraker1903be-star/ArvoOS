// Ana sayfa — global düzen (28.10.2026): açılış + üç rozet, üç ürünün
// yan yana kartları (başlangıç fiyatıyla), "her yerde çalışır" şeridi,
// ArvoOS kutusu ve akış sahnesi, tasarım ilkeleri, ArvoLab ve ArvoBook
// kutuları, hizmetler, referanslar, SSS ve açık kapanış.
// Eskiden ürünler yalnızca art arda tam genişlik kutulardı: ziyaretçi
// üç ürünü ve fiyat düzeyini ancak sayfanın sonuna inince görüyordu.
// Sahneler beyaz / gri keskin; koyu zemin yalnızca maketlerin içinde.
import Link from "next/link";
import type { ReactNode } from "react";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import type { SiteProduct } from "@/lib/site/pricing";
import { COMPANY, ROUTES, type Locale } from "@/lib/site/routes";
import { JsonLd, faqLd, organizationLd, webPageLd, websiteLd } from "@/lib/site/structured-data";
import type { HomeContent } from "../_content/home";
import { Fragment } from "../_components/frags";
import { HeroStage } from "../_components/hero-stage";
import { BrandLogo, ProductLogo, type ProductName } from "../_components/marks";
import { GlobalStrip, HeroBadges, baslangicYazisi } from "../_components/global";
import { BookMock } from "../_components/mock-book";
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


export async function HomeView({ locale, c }: { locale: Locale; c: HomeContent }) {
  const { os, lab, book } = c.products;
  const more = KISA[locale].more;
  const signIn = KISA[locale].signIn;
  const visuals = ["web", "seo", "software"] as const;
  // Ücretler sayfasıyla aynı kaynak: konsoldan yayımlanan TL tutarı burada da görünür.
  const fiyatlar = await yayimlananFiyatlar();
  const fiyatYazisi = (urun: SiteProduct) => baslangicYazisi(urun, locale, c.global, fiyatlar);
  const kartlar: { name: ProductName; urun: SiteProduct; p: typeof os }[] = [
    { name: "ArvoOS", urun: "arvoos", p: os },
    { name: "ArvoLab", urun: "arvolab", p: lab },
    { name: "ArvoBook", urun: "randevu", p: book },
  ];
  return (
    <>
      <section className="lhero" aria-labelledby="hero-title">
        <div className="wrap lhero-copy">
          <p className="eyebrow rise" style={d(0)}>{c.hero.eyebrow}</p>
          <h1 id="hero-title" className="display rise" style={d(1)}>{c.hero.title}{c.hero.subtitle ? <span className="thin"> {c.hero.subtitle}</span> : null}</h1>
          <p className="lead rise" style={d(2)}>{c.hero.lead}</p>
          <Actions items={c.hero.actions} className="rise" />
          <HeroBadges items={c.global.badges} style={d(4)} />
        </div>
        <HeroStage locale={locale} />
      </section>

      <div className="scenes">
        <section className="section suite" id={KISA[locale].productsAnchor} aria-labelledby="suite-title">
          <div className="wrap">
            <SectionHead eyebrow={c.products.eyebrow} title={c.products.title} lead={c.products.lead} center id="suite-title" />
            <div className="suite-grid">
              {kartlar.map(({ name, urun, p }, i) => (
                <article key={name} className="suite-card" data-reveal style={{ ["--i" as string]: i }}>
                  <ProductLogo name={name} height={30} />
                  <p className="suite-kicker">{p.label}</p>
                  <p className="suite-text">{p.text}</p>
                  <ul className="chips suite-chips">{p.chips.slice(0, 4).map((x) => <li key={x} className="chip">{x}</li>)}</ul>
                  <p className="suite-price">{fiyatYazisi(urun)}</p>
                  <div className="suite-links">
                    <Link className="alink" href={p.cta.href}>{more}</Link>
                    <a className="alink" href={p.signIn.href} target="_blank" rel="noopener">{signIn}</a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <GlobalStrip g={c.global} />

        <ProductTile name="ArvoOS" kicker={os.label} title={os.title} sub={os.text} href={os.cta.href} app={os.signIn.href} more={more} signIn={signIn}>
          <ArvoosTrio locale={locale} />
        </ProductTile>

        <StoryStage locale={locale} eyebrow={c.story.eyebrow} title={c.story.title} lead={c.story.lead} steps={c.story.steps} footer={<Actions items={[c.story.cta]} />} />

        <section className="section pillars" aria-labelledby="pillars-title">
          <div className="wrap">
            <SectionHead eyebrow={c.values.eyebrow} title={c.values.title} center id="pillars-title" />
            <ol className="pillars-grid">
              {c.values.items.map((x, i) => (
                <li key={x.title} data-reveal style={{ ["--i" as string]: i }}>
                  <span className="pillars-num">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{x.title}</h3>
                  <p>{x.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <ProductTile name="ArvoLab" kicker={lab.label} title={lab.title} sub={lab.text} href={lab.cta.href} app={lab.signIn.href} more={more} signIn={signIn} narrow>
          <LabMock locale={locale} />
        </ProductTile>

        {/* ArvoARC'ın yeri 28.10.2026'dan beri ArvoBook: ARC satılmıyor. Kutuda
            ArvoLab'daki gibi ürünün kendi ekranı (günün takvimi) duruyor;
            eskiden maket yoktu ve tek bir yüzen kart çiziliyordu. */}
        <ProductTile name="ArvoBook" kicker={book.label} title={book.title} sub={book.text} href={book.cta.href} app={book.signIn.href} more={more} signIn={signIn} narrow>
          <BookMock locale={locale} />
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
