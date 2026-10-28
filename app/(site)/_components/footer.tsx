// Alt bilgi — 28.10.2026'da ikinci kez yeniden kuruldu. İlk deneme (dev
// slogan, rozetler, sayfa genişliğinde dev "ARVO" yazısı) kurum sahibine
// gösterişli geldi ve markanın adı ARVO değil ArvoOS. Bu sürüm sade ve
// seçkin: logonun laciverti, ince yeşil çizgiler (renkler site-luxe.css), solda ArvoOS logosu
// ve slogan, sağda sütunlar, altta ürün ailesi ve künye. Sitenin geri
// kalanı açık zeminde kalır; koyu zemin bilerek yalnızca alt bilgide —
// sayfanın bittiğini söyleyen tek yer burası (site-base.css'teki kural
// arayüz maketleri ve alt bilgi için).
import Link from "next/link";
import { COMPANY, ROUTES, type Locale } from "@/lib/site/routes";
import { CHROME, type NavLink } from "../_content/chrome";
import { BrandLogo, Globe, InstagramMark, ProductLogo, type ProductName } from "./marks";
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
        <div className="ftr-top">
          <div className="ftr-brand">
            <Link href={ROUTES.home[locale]} aria-label="ArvoOS"><BrandLogo brand="arvoos" tone="dark" alt="ArvoOS" /></Link>
            <p className="ftr-motto">{t.footerTagline}</p>
            <p className="ftr-group">ArvoOS — {t.group}</p>
            <a className="ftr-mail" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
          </div>
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
        </div>

        <nav className="ftr-products" aria-label={t.products}>
          {t.productLinks.map((p) => (
            <Link key={p.href} href={p.href} className="ftr-product">
              <ProductLogo name={p.label as ProductName} tone="dark" height={18} withAlt />
              <span>{p.desc}</span>
            </Link>
          ))}
        </nav>

        <div className="ftr-legal">
          <address className="ftr-address">
            <strong>{COMPANY.legalName}</strong> · {locale === "tr" ? COMPANY.address.display : COMPANY.address.displayIntl}
          </address>
          <div className="ftr-meta">
            <span>© {year} ArvoCulture Group. {t.rights}</span>
            {/* Hesap adı COMPANY'de tek yerde; schema.org sameAs'ı da
                aynı yerden okuyor. */}
            <a className="ftr-social" href={COMPANY.instagramUrl} target="_blank" rel="noopener" aria-label={`Instagram · @${COMPANY.instagram}`}>
              <InstagramMark /><span>@{COMPANY.instagram}</span>
            </a>
            <span className="ftr-langs" aria-label={t.language}><Globe className="ftr-globe" /><DilBaglantilari locale={locale} className="ftr-lang" /></span>
          </div>
        </div>
      </div>
    </footer>
  );
}
