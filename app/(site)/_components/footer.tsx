// Alt bilgi (28.10.2026'da yeniden kuruldu). Eskiden yalnızca küçük
// punto bağlantı sütunlarıydı ve sayfa sessizce bitiyordu; şimdi bir
// kapanış sahnesi var: büyük slogan + rozetler, ürün kartları,
// sütunlar ve en altta kaydırdıkça yükselen dev ARVO yazısı. Zemin açık
// kalır (site-base.css: koyu yalnızca maketlerde). Düğme YOK: sayfaların
// çoğu zaten demo/ücretler düğmeli kapanışla bitiyor, alt alta tekrar ederdi.
import Link from "next/link";
import { COMPANY, ROUTES, type Locale } from "@/lib/site/routes";
import { CHROME, type NavLink } from "../_content/chrome";
import { BrandLogo, InstagramMark, ProductLogo, type ProductName } from "./marks";
import { HOME_ICERIGI } from "../_content/home-icerik";
import { HeroBadges } from "./global";
import { DilBaglantilari } from "./lang-link";

function Col({ title, links }: { title: string; links: NavLink[] }) {
  return (
    <div>
      <h2 className="ftr-h">{title}</h2>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            {l.external ? <a href={l.href} target="_blank" rel="noopener">{l.label}</a> : <Link href={l.href}>{l.label}</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = CHROME[locale];
  const year = new Date().getFullYear();
  return (
    <footer className="ftr">
      <div className="wrap">
        <section className="ftr-hero" aria-labelledby="ftr-hero-title">
          <p className="ftr-hero-eyebrow">{t.footerCta}</p>
          <h2 id="ftr-hero-title" className="ftr-hero-title">{t.footerTagline}</h2>
          <HeroBadges items={HOME_ICERIGI[locale].global.badges} />
        </section>

        <nav className="ftr-products" aria-label={t.products}>
          {t.productLinks.map((p) => (
            <Link key={p.href} href={p.href} className="ftr-product">
              <ProductLogo name={p.label as ProductName} height={22} withAlt />
              <span className="ftr-product-desc">{p.desc}</span>
              <span className="ftr-product-go" aria-hidden="true">→</span>
            </Link>
          ))}
        </nav>
        <div className="ftr-cols">
          <Col title={t.products} links={[...t.productLinks, ...t.arvoosLinks]} />
          <Col title={t.services} links={t.serviceLinks} />
          <Col title={t.company} links={[{ label: t.pricing, href: ROUTES.pricing[locale] }, { label: t.about, href: ROUTES.about[locale] }, { label: t.contact, href: ROUTES.contact[locale] }]} />
          <Col title={t.signIn} links={t.signInLinks} />
          {/* Mesafeli satış mevzuatı ve ödeme kuruluşu bu metinlerin her
              sayfadan ulaşılabilir olmasını istiyor; alt bilgi tek yer. */}
          <Col title={t.legal} links={[
            { label: t.privacy, href: ROUTES.privacy[locale] },
            { label: t.distanceSales, href: ROUTES["distance-sales"][locale] },
            { label: t.refund, href: ROUTES.refund[locale] },
            { label: t.delivery, href: ROUTES.delivery[locale] },
          ]} />
        </div>
        <div className="ftr-legal">
          <address className="ftr-address">
            <strong>{COMPANY.legalName}</strong> · {locale === "tr" ? COMPANY.address.display : COMPANY.address.displayIntl} · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
          </address>
          <div className="ftr-meta">
            {/* Hesap adı COMPANY'de tek yerde; schema.org sameAs'ı da
                aynı yerden okuyor. */}
            <a className="ftr-social" href={COMPANY.instagramUrl} target="_blank" rel="noopener" aria-label={`Instagram · @${COMPANY.instagram}`}>
              <InstagramMark /><span>@{COMPANY.instagram}</span>
            </a>
            <span>© {year} ArvoCulture Group. {t.rights}</span>
            <span className="ftr-langs" aria-label={t.language}><DilBaglantilari locale={locale} className="ftr-lang" /></span>
            <Link href={ROUTES.arvoos[locale]} className="ftr-credit" aria-label="Designed by ArvoOS">
              <span>Designed by</span><BrandLogo brand="arvoos" />
            </Link>
          </div>
        </div>
      </div>
      {/* Dev yazı süs: ekran okuyucuya kapalı, marka adı zaten yukarıda geçiyor. */}
      <div className="ftr-giant" aria-hidden="true"><span>ARVO</span></div>
    </footer>
  );
}
