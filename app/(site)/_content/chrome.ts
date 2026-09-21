// Üst menü ve alt bilgi metinleri (TR + EN). Bağlantılar yalnızca ROUTES'tan.
import { PRODUCT_APPS, ROUTES, type Locale } from "@/lib/site/routes";

export type NavLink = { label: string; href: string; desc?: string; external?: boolean };

type Chrome = {
  skip: string; home: string; nav: string; menu: string; close: string;
  products: string; services: string; about: string; contact: string; privacy: string;
  legal: string; distanceSales: string; refund: string; delivery: string;
  signIn: string; demo: string; langName: string; langShort: string;
  productLinks: NavLink[]; arvoosTitle: string; arvoosLinks: NavLink[];
  serviceLinks: NavLink[]; signInLinks: NavLink[];
  footerTagline: string; footerCta: string; company: string; rights: string; addressLabel: string; group: string;
};

const signInLinks: NavLink[] = (["arvoos", "arvolab", "arc"] as const).map((key) => ({
  label: PRODUCT_APPS[key].name,
  desc: PRODUCT_APPS[key].host,
  href: PRODUCT_APPS[key].url,
  external: true,
}));

export const CHROME: Record<Locale, Chrome> = {
  tr: {
    skip: "İçeriğe geç", home: "ArvoOS — Arvo ana sayfa", nav: "Ana menü", menu: "Menüyü aç", close: "Menüyü kapat",
    products: "Ürünler", services: "Hizmetler", about: "Hakkımızda", contact: "İletişim", privacy: "Gizlilik ve KVKK",
    legal: "Yasal", distanceSales: "Mesafeli Satış Sözleşmesi", refund: "İptal ve İade", delivery: "Teslimat",
    signIn: "Giriş", demo: "Demo talep et", langName: "English", langShort: "EN",
    productLinks: [
      { label: "ArvoOS", desc: "İşletme işletim sistemi", href: ROUTES.arvoos.tr },
      { label: "ArvoLab", desc: "Araştırma çalışma alanı", href: ROUTES.arvolab.tr },
      { label: "Arc", desc: "E-ticaret ve mağaza yönetimi", href: ROUTES.arc.tr },
    ],
    arvoosTitle: "ArvoOS’u keşfedin",
    arvoosLinks: [
      { label: "Modüller", href: ROUTES["arvoos-modules"].tr },
      { label: "Sektörler", href: ROUTES["arvoos-industries"].tr },
      { label: "Çözümler", href: ROUTES["arvoos-solutions"].tr },
      { label: "Paketler", href: ROUTES["arvoos-plans"].tr },
    ],
    serviceLinks: [
      { label: "Tüm hizmetler", desc: "Markadan sisteme, uçtan uca", href: ROUTES.services.tr },
      { label: "Web sitesi tasarımı", desc: "Strateji, tasarım, geliştirme", href: ROUTES["web-design"].tr },
      { label: "SEO ve GEO", desc: "Arama ve yapay zekâ görünürlüğü", href: ROUTES["seo-geo"].tr },
      { label: "Özel yazılım", desc: "Panel, portal ve iş akışları", href: ROUTES["custom-software"].tr },
    ],
    signInLinks,
    footerTagline: "Daha iyi çalışmak için daha iyi sistemler.",
    footerCta: "Birlikte tasarlayalım",
    company: "Kurumsal", rights: "Tüm hakları saklıdır.", addressLabel: "Adres", group: "bir ArvoCulture Group markasıdır",
  },
  en: {
    skip: "Skip to content", home: "Arvo home", nav: "Main menu", menu: "Open menu", close: "Close menu",
    products: "Products", services: "Services", about: "About", contact: "Contact", privacy: "Privacy",
    legal: "Legal", distanceSales: "Distance Sales Agreement", refund: "Cancellation & Refund", delivery: "Delivery",
    signIn: "Sign in", demo: "Request a demo", langName: "Türkçe", langShort: "TR",
    productLinks: [
      { label: "ArvoOS", desc: "Business operating system", href: ROUTES.arvoos.en },
      { label: "ArvoLab", desc: "Research workspace", href: ROUTES.arvolab.en },
      { label: "Arc", desc: "E-commerce and store management", href: ROUTES.arc.en },
    ],
    arvoosTitle: "Explore ArvoOS",
    arvoosLinks: [
      { label: "Modules", href: ROUTES["arvoos-modules"].en },
      { label: "Industries", href: ROUTES["arvoos-industries"].en },
      { label: "Solutions", href: ROUTES["arvoos-solutions"].en },
      { label: "Plans", href: ROUTES["arvoos-plans"].en },
    ],
    serviceLinks: [
      { label: "All services", desc: "From brand to system", href: ROUTES.services.en },
      { label: "Web design", desc: "Strategy, design, development", href: ROUTES["web-design"].en },
      { label: "SEO & GEO", desc: "Search and AI visibility", href: ROUTES["seo-geo"].en },
      { label: "Custom software", desc: "Panels, portals, workflows", href: ROUTES["custom-software"].en },
    ],
    signInLinks,
    footerTagline: "Better systems for better work.",
    footerCta: "Let’s design it together",
    company: "Company", rights: "All rights reserved.", addressLabel: "Address", group: "an ArvoCulture Group brand",
  },
};
