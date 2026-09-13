"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ROUTES, type Locale } from "@/lib/site/routes";
import { CHROME, type NavLink } from "../_content/chrome";
import { BrandLogo, Chevron, ProductLogo, type ProductName } from "./marks";
import { LangLink } from "./lang-link";

type MenuId = "products" | "services" | "signin";

function Item({ link, onNavigate }: { link: NavLink; onNavigate: () => void }) {
  const inner = <><b>{link.label}</b>{link.desc ? <span>{link.desc}</span> : null}</>;
  return link.external
    ? <a className="pop-item" href={link.href} target="_blank" rel="noopener" onClick={onNavigate}>{inner}</a>
    : <Link className="pop-item" href={link.href} onClick={onNavigate}>{inner}</Link>;
}

export function SiteHeader({ locale }: { locale: Locale }) {
  const t = CHROME[locale];
  const pathname = usePathname() ?? "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState<MenuId | null>(null);
  const [sheet, setSheet] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const hoverTimer = useRef<number>(0);
  const close = useCallback(() => { setOpen(null); setSheet(false); }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Sayfa değişince menüler kapanır (render sırasında, efekt değil).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setOpen(null); setSheet(false); }

  useEffect(() => {
    if (!open && !sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open, sheet, close]);

  useEffect(() => {
    document.documentElement.style.overflow = sheet ? "hidden" : "";
    return () => { document.documentElement.style.overflow = ""; };
  }, [sheet]);

  const hover = (id: MenuId | null) => (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setOpen(id), id ? 60 : 160);
  };
  const toggle = (id: MenuId) => setOpen((cur) => (cur === id ? null : id));
  const isActive = (href: string) => (href === "/" || href === "/en" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  const productsActive = t.productLinks.some((l) => isActive(l.href));
  const servicesActive = isActive(ROUTES.services[locale]);

  const trigger = (id: MenuId, label: string, active = false, extra = "") => (
    <button type="button" className={`hdr-link ${extra}`} aria-expanded={open === id} aria-controls={`hdr-${id}`} data-active={active || undefined} onClick={() => toggle(id)}>
      {label}<Chevron className="hdr-chev" />
    </button>
  );

  return (
    <header ref={ref} className="hdr" data-solid={scrolled || sheet || undefined} data-sheet={sheet || undefined}>
      <div className="hdr-bar wrap-wide">
        <Link className="hdr-logo" href={ROUTES.home[locale]} aria-label={t.home}>
          <BrandLogo brand="arvoos" priority />
        </Link>

        <nav className="hdr-nav" aria-label={t.nav}>
          <ul>
            <li className="hdr-item" onPointerEnter={hover("products")} onPointerLeave={hover(null)}>
              {trigger("products", t.products, productsActive)}
              <div id="hdr-products" className="hdr-pop hdr-pop-products" hidden={open !== "products"}>
                <div className="pop-products">
                  {t.productLinks.map((l) => (
                    <Link key={l.href} className="pop-product" href={l.href} onClick={close}>
                      <ProductLogo name={l.label as ProductName} height={22} />
                      <span><span>{l.desc}</span></span>
                    </Link>
                  ))}
                </div>
                <div className="pop-side">
                  <p className="pop-label">{t.arvoosTitle}</p>
                  {t.arvoosLinks.map((l) => <Link key={l.href} className="pop-sublink" href={l.href} onClick={close}>{l.label}</Link>)}
                </div>
              </div>
            </li>
            <li className="hdr-item" onPointerEnter={hover("services")} onPointerLeave={hover(null)}>
              {trigger("services", t.services, servicesActive)}
              <div id="hdr-services" className="hdr-pop" hidden={open !== "services"}>
                {t.serviceLinks.map((l) => <Item key={l.href} link={l} onNavigate={close} />)}
              </div>
            </li>
            <li><Link className="hdr-link" href={ROUTES.about[locale]} aria-current={isActive(ROUTES.about[locale]) ? "page" : undefined}>{t.about}</Link></li>
            <li><Link className="hdr-link" href={ROUTES.contact[locale]} aria-current={isActive(ROUTES.contact[locale]) ? "page" : undefined}>{t.contact}</Link></li>
          </ul>
        </nav>

        <div className="hdr-actions">
          <LangLink locale={locale} className="hdr-lang" label={t.langName} short={t.langShort} />
          <div className="hdr-item hdr-signin" onPointerEnter={hover("signin")} onPointerLeave={hover(null)}>
            {trigger("signin", t.signIn)}
            <div id="hdr-signin" className="hdr-pop hdr-pop-right" hidden={open !== "signin"}>
              {t.signInLinks.map((l) => <Item key={l.href} link={l} onNavigate={close} />)}
            </div>
          </div>
          <Link className="btn btn-s hdr-cta" href={`${ROUTES.contact[locale]}${locale === "tr" ? "?ilgi=arvoos" : "?interest=arvoos"}`}>{t.demo}</Link>
          <button type="button" className="hdr-burger" aria-expanded={sheet} aria-controls="hdr-sheet" aria-label={sheet ? t.close : t.menu} onClick={() => { setOpen(null); setSheet((s) => !s); }}>
            <span /><span />
          </button>
        </div>
      </div>

      <div id="hdr-sheet" className="hdr-sheet" hidden={!sheet}>
        <div className="wrap sheet-inner">
          <p className="sheet-label">{t.products}</p>
          {t.productLinks.map((l) => <Link key={l.href} className="sheet-link" href={l.href} onClick={close}>{l.label}<small>{l.desc}</small></Link>)}
          <div className="sheet-sub">{t.arvoosLinks.map((l) => <Link key={l.href} href={l.href} onClick={close}>{l.label}</Link>)}</div>
          <p className="sheet-label">{t.services}</p>
          {t.serviceLinks.map((l) => <Link key={l.href} className="sheet-link sheet-link-s" href={l.href} onClick={close}>{l.label}</Link>)}
          <p className="sheet-label">{t.company}</p>
          <Link className="sheet-link sheet-link-s" href={ROUTES.about[locale]} onClick={close}>{t.about}</Link>
          <Link className="sheet-link sheet-link-s" href={ROUTES.contact[locale]} onClick={close}>{t.contact}</Link>
          <p className="sheet-label">{t.signIn}</p>
          <div className="sheet-signin">{t.signInLinks.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noopener">{l.label} <span aria-hidden="true">↗</span></a>)}</div>
          <div className="sheet-foot"><LangLink locale={locale} className="btn btn-ghost" label={t.langName} /></div>
        </div>
      </div>
    </header>
  );
}
