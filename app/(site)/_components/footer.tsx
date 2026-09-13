import Link from "next/link";
import { COMPANY, ROUTES, type Locale } from "@/lib/site/routes";
import { CHROME, type NavLink } from "../_content/chrome";
import { BrandLogo } from "./marks";
import { LangLink } from "./lang-link";

function Col({ title, links }: { title: string; links: NavLink[] }) {
  return (
    <div>
      <h2 className="ftr-h">{title}</h2>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            {l.external ? <a href={l.href} target="_blank" rel="noopener">{l.label} <span aria-hidden="true">↗</span></a> : <Link href={l.href}>{l.label}</Link>}
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
      <div className="wrap-wide">
        <div className="ftr-top">
          <div className="ftr-brand">
            <Link className="ftr-logo" href={ROUTES.home[locale]} aria-label={t.home}><BrandLogo brand="arvoos" tone="dark" /></Link>
            <p className="ftr-group"><BrandLogo brand="arvoculture" tone="dark" alt="ArvoCulture Group" /><span>{t.group}</span></p>
            <p className="ftr-tagline">{t.footerTagline}</p>
          </div>
          <Link className="btn btn-gold" href={ROUTES.contact[locale]}>{t.footerCta} <span className="arrow" aria-hidden="true">→</span></Link>
        </div>
        <div className="ftr-cols">
          <Col title={t.products} links={[...t.productLinks, ...t.arvoosLinks.slice(0, 2)]} />
          <Col title={t.services} links={t.serviceLinks} />
          <Col title={t.company} links={[{ label: t.about, href: ROUTES.about[locale] }, { label: t.contact, href: ROUTES.contact[locale] }, { label: t.privacy, href: ROUTES.privacy[locale] }]} />
          <Col title={t.signIn} links={t.signInLinks} />
        </div>
        <nav className="ftr-sign" aria-label={t.products}>
          <Link href={ROUTES.arvoos[locale]}><BrandLogo brand="arvoos" tone="dark" alt="ArvoOS" /></Link>
          <Link href={ROUTES.arvolab[locale]}><BrandLogo brand="arvolab" tone="dark" alt="ArvoLab" /></Link>
          <Link href={ROUTES.arc[locale]}><BrandLogo brand="arc" tone="dark" alt="Arvo Arc" /></Link>
        </nav>
        <div className="ftr-bottom">
          <address className="ftr-address">
            <strong>{COMPANY.legalName}</strong>
            <span>{COMPANY.address.display}</span>
            <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
          </address>
          <div className="ftr-meta">
            <LangLink locale={locale} className="ftr-lang" label={t.langName} />
            <span>© {year} ArvoCulture Group. {t.rights}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
