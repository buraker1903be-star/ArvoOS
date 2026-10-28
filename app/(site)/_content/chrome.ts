// Üst menü ve alt bilgi metinleri (TR, EN, DE, ES, FR). Bağlantılar yalnızca ROUTES'tan.
import { ARC_APP, PRODUCT_APPS, ROUTES, type Locale } from "@/lib/site/routes";

export type NavLink = { label: string; href: string; desc?: string; external?: boolean };

type Chrome = {
  skip: string; home: string; nav: string; menu: string; close: string;
  products: string; services: string; pricing: string; about: string; contact: string; privacy: string;
  legal: string; distanceSales: string; refund: string; delivery: string;
  signIn: string; demo: string; language: string;
  productLinks: NavLink[]; arvoosTitle: string; arvoosLinks: NavLink[];
  serviceLinks: NavLink[]; signInLinks: NavLink[];
  footerTagline: string; footerCta: string; company: string; rights: string; addressLabel: string; group: string;
};

/* Ürünlerin giriş adresi menüde: liste PRODUCT_APPS'ten geliyor, yeni
   ürün eklenince menüye elle eklenmesi gerekmesin. ArvoARC ürün olarak
   satılmıyor (28.10.2026) ama e-ticaret sitesini Arvo'ya yaptıranlar
   paneline buradan giriyor; listenin sonunda, ayrı. */
const signInLinks: NavLink[] = [
  ...(["arvoos", "arvolab", "randevu"] as const).map((key) => ({
    label: PRODUCT_APPS[key].name,
    desc: PRODUCT_APPS[key].host,
    href: PRODUCT_APPS[key].url,
    external: true,
  })),
  { label: ARC_APP.name, desc: ARC_APP.host, href: ARC_APP.url, external: true },
];

export const CHROME: Record<Locale, Chrome> = {
  tr: {
    skip: "İçeriğe geç", home: "ArvoOS — Arvo ana sayfa", nav: "Ana menü", menu: "Menüyü aç", close: "Menüyü kapat",
    products: "Ürünler", services: "Hizmetler", pricing: "Ücretler", about: "Hakkımızda", contact: "İletişim", privacy: "Gizlilik ve KVKK",
    legal: "Yasal", distanceSales: "Mesafeli Satış Sözleşmesi", refund: "İptal ve İade", delivery: "Teslimat",
    signIn: "Giriş", demo: "Demo talep et", language: "Dil",
    productLinks: [
      { label: "ArvoOS", desc: "İşletme işletim sistemi", href: ROUTES.arvoos.tr },
      { label: "ArvoLab", desc: "Araştırma çalışma alanı", href: ROUTES.arvolab.tr },
      { label: "ArvoBook", desc: "Salon randevu yönetimi", href: ROUTES.randevu.tr },
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
    products: "Products", services: "Services", pricing: "Pricing", about: "About", contact: "Contact", privacy: "Privacy",
    legal: "Legal", distanceSales: "Distance Sales Agreement", refund: "Cancellation & Refund", delivery: "Delivery",
    signIn: "Sign in", demo: "Request a demo", language: "Language",
    productLinks: [
      { label: "ArvoOS", desc: "Business operating system", href: ROUTES.arvoos.en },
      { label: "ArvoLab", desc: "Research workspace", href: ROUTES.arvolab.en },
      { label: "ArvoBook", desc: "Salon appointment management", href: ROUTES.randevu.en },
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
  de: {
    skip: "Zum Inhalt springen", home: "Arvo Startseite", nav: "Hauptmenü", menu: "Menü öffnen", close: "Menü schließen",
    products: "Produkte", services: "Leistungen", pricing: "Preise", about: "Über uns", contact: "Kontakt", privacy: "Datenschutz",
    legal: "Rechtliches", distanceSales: "Fernabsatzvertrag", refund: "Kündigung & Erstattung", delivery: "Lieferung",
    signIn: "Anmelden", demo: "Demo anfragen", language: "Sprache",
    productLinks: [
      { label: "ArvoOS", desc: "Betriebssystem für Unternehmen", href: ROUTES.arvoos.de },
      { label: "ArvoLab", desc: "Arbeitsbereich für Forschung", href: ROUTES.arvolab.de },
      { label: "ArvoBook", desc: "Terminverwaltung für Salons", href: ROUTES.randevu.de },
    ],
    arvoosTitle: "ArvoOS entdecken",
    arvoosLinks: [
      { label: "Module", href: ROUTES["arvoos-modules"].de },
      { label: "Branchen", href: ROUTES["arvoos-industries"].de },
      { label: "Lösungen", href: ROUTES["arvoos-solutions"].de },
      { label: "Pakete", href: ROUTES["arvoos-plans"].de },
    ],
    serviceLinks: [
      { label: "Alle Leistungen", desc: "Von der Marke zum System", href: ROUTES.services.de },
      { label: "Webdesign", desc: "Strategie, Design, Entwicklung", href: ROUTES["web-design"].de },
      { label: "SEO & GEO", desc: "Sichtbarkeit in Suche und KI", href: ROUTES["seo-geo"].de },
      { label: "Individuelle Software", desc: "Panels, Portale, Workflows", href: ROUTES["custom-software"].de },
    ],
    signInLinks,
    footerTagline: "Bessere Systeme für bessere Arbeit.",
    footerCta: "Lassen Sie es uns gemeinsam gestalten",
    company: "Unternehmen", rights: "Alle Rechte vorbehalten.", addressLabel: "Adresse", group: "eine Marke der ArvoCulture Group",
  },
  es: {
    skip: "Saltar al contenido", home: "Inicio de Arvo", nav: "Menú principal", menu: "Abrir menú", close: "Cerrar menú",
    products: "Productos", services: "Servicios", pricing: "Precios", about: "Nosotros", contact: "Contacto", privacy: "Privacidad",
    legal: "Legal", distanceSales: "Contrato de venta a distancia", refund: "Cancelación y reembolso", delivery: "Entrega",
    signIn: "Iniciar sesión", demo: "Solicitar una demo", language: "Idioma",
    productLinks: [
      { label: "ArvoOS", desc: "Sistema operativo para empresas", href: ROUTES.arvoos.es },
      { label: "ArvoLab", desc: "Espacio de trabajo para investigación", href: ROUTES.arvolab.es },
      { label: "ArvoBook", desc: "Gestión de citas para salones", href: ROUTES.randevu.es },
    ],
    arvoosTitle: "Descubra ArvoOS",
    arvoosLinks: [
      { label: "Módulos", href: ROUTES["arvoos-modules"].es },
      { label: "Sectores", href: ROUTES["arvoos-industries"].es },
      { label: "Soluciones", href: ROUTES["arvoos-solutions"].es },
      { label: "Planes", href: ROUTES["arvoos-plans"].es },
    ],
    serviceLinks: [
      { label: "Todos los servicios", desc: "De la marca al sistema", href: ROUTES.services.es },
      { label: "Diseño web", desc: "Estrategia, diseño, desarrollo", href: ROUTES["web-design"].es },
      { label: "SEO y GEO", desc: "Visibilidad en búsqueda e IA", href: ROUTES["seo-geo"].es },
      { label: "Software a medida", desc: "Paneles, portales, flujos de trabajo", href: ROUTES["custom-software"].es },
    ],
    signInLinks,
    footerTagline: "Mejores sistemas para un mejor trabajo.",
    footerCta: "Diseñémoslo juntos",
    company: "Empresa", rights: "Todos los derechos reservados.", addressLabel: "Dirección", group: "una marca de ArvoCulture Group",
  },
  fr: {
    skip: "Aller au contenu", home: "Accueil Arvo", nav: "Menu principal", menu: "Ouvrir le menu", close: "Fermer le menu",
    products: "Produits", services: "Services", pricing: "Tarifs", about: "À propos", contact: "Contact", privacy: "Confidentialité",
    legal: "Informations juridiques", distanceSales: "Contrat de vente à distance", refund: "Annulation et remboursement", delivery: "Livraison",
    signIn: "Se connecter", demo: "Demander une démo", language: "Langue",
    productLinks: [
      { label: "ArvoOS", desc: "Système d’exploitation d’entreprise", href: ROUTES.arvoos.fr },
      { label: "ArvoLab", desc: "Espace de travail pour la recherche", href: ROUTES.arvolab.fr },
      { label: "ArvoBook", desc: "Gestion des rendez-vous pour salons", href: ROUTES.randevu.fr },
    ],
    arvoosTitle: "Découvrir ArvoOS",
    arvoosLinks: [
      { label: "Modules", href: ROUTES["arvoos-modules"].fr },
      { label: "Secteurs", href: ROUTES["arvoos-industries"].fr },
      { label: "Solutions", href: ROUTES["arvoos-solutions"].fr },
      { label: "Offres", href: ROUTES["arvoos-plans"].fr },
    ],
    serviceLinks: [
      { label: "Tous les services", desc: "De la marque au système", href: ROUTES.services.fr },
      { label: "Conception web", desc: "Stratégie, design, développement", href: ROUTES["web-design"].fr },
      { label: "SEO et GEO", desc: "Visibilité dans la recherche et l’IA", href: ROUTES["seo-geo"].fr },
      { label: "Logiciel sur mesure", desc: "Panneaux, portails, flux de travail", href: ROUTES["custom-software"].fr },
    ],
    signInLinks,
    footerTagline: "De meilleurs systèmes pour un meilleur travail.",
    footerCta: "Concevons-le ensemble",
    company: "Entreprise", rights: "Tous droits réservés.", addressLabel: "Adresse", group: "une marque d’ArvoCulture Group",
  },
};
