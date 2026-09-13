// apple.com tarzı açık gri, küçük punto alt bilgi. Logolar özgün renkli ve küçük.
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
        <nav className="ftr-brands" aria-label={t.products}>
          <Link href={ROUTES.arvoos[locale]}><BrandLogo brand="arvoos" alt="ArvoOS" /></Link>
          <Link href={ROUTES.arvolab[locale]}><BrandLogo brand="arvolab" alt="ArvoLab" /></Link>
          <Link href={ROUTES.arc[locale]}><BrandLogo brand="arc" alt="Arvo Arc" /></Link>
          <span className="ftr-tag">{t.footerTagline}</span>
        </nav>
        <div className="ftr-cols">
          <Col title={t.products} links={[...t.productLinks, ...t.arvoosLinks]} />
          <Col title={t.services} links={t.serviceLinks} />
          <Col title={t.company} links={[{ label: t.about, href: ROUTES.about[locale] }, { label: t.contact, href: ROUTES.contact[locale] }, { label: t.privacy, href: ROUTES.privacy[locale] }]} />
          <Col title={t.signIn} links={t.signInLinks} />
        </div>
        <div className="ftr-legal">
          <address className="ftr-address">
            <strong>{COMPANY.legalName}</strong> · {COMPANY.address.display} · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
          </address>
          <div className="ftr-meta">
            <span>© {year} ArvoCulture Group. {t.rights}</span>
            <LangLink locale={locale} className="ftr-lang" label={t.langName} />
          </div>
        </div>
      </div>
    </footer>
  );
}
