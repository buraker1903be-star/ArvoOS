// Görünümlerde tekrar eden kısa arayüz ifadeleri, dil başına tek yerde.
// Eskiden her görünüm `locale === "tr" ? … : …` yazıyordu; üçüncü dil
// eklenince bu kalıp sessizce İngilizce'ye düşüyordu. Record<Locale>
// eksik dili derlemede yakalıyor.
import type { Locale } from "@/lib/site/routes";

type Kisa = {
  crumb: string; more: string; details: string; signIn: string;
  billingPeriod: string; product: string; arvoosPages: string; productsAnchor: string;
  /** Gezinme yolunun ilk halkası. Eskiden marka adıydı; marka ArvoOS olunca
   *  ArvoOS ürün sayfasında "ArvoOS › ArvoOS" yazıyordu (28.10.2026). */
  homeCrumb: string;
};

export const KISA: Record<Locale, Kisa> = {
  en: { crumb: "Breadcrumb", more: "Learn more", details: "Learn more", signIn: "Sign in", billingPeriod: "Billing period", product: "Product", arvoosPages: "ArvoOS pages", productsAnchor: "products", homeCrumb: "Home" },
  tr: { crumb: "İçerik yolu", more: "Daha fazla bilgi", details: "Detaylar", signIn: "Giriş", billingPeriod: "Ödeme dönemi", product: "Ürün", arvoosPages: "ArvoOS sayfaları", productsAnchor: "urunler", homeCrumb: "Ana sayfa" },
  de: { crumb: "Brotkrumen-Navigation", more: "Mehr erfahren", details: "Mehr erfahren", signIn: "Anmelden", billingPeriod: "Abrechnungszeitraum", product: "Produkt", arvoosPages: "ArvoOS-Seiten", productsAnchor: "produkte", homeCrumb: "Startseite" },
  es: { crumb: "Ruta de navegación", more: "Más información", details: "Más información", signIn: "Iniciar sesión", billingPeriod: "Periodo de facturación", product: "Producto", arvoosPages: "Páginas de ArvoOS", productsAnchor: "productos", homeCrumb: "Inicio" },
  fr: { crumb: "Fil d’Ariane", more: "En savoir plus", details: "En savoir plus", signIn: "Se connecter", billingPeriod: "Période de facturation", product: "Produit", arvoosPages: "Pages ArvoOS", productsAnchor: "produits", homeCrumb: "Accueil" },
  ar: { crumb: "مسار التنقل", more: "اعرف المزيد", details: "اعرف المزيد", signIn: "تسجيل الدخول", billingPeriod: "فترة الفوترة", product: "المنتج", arvoosPages: "صفحات ArvoOS", productsAnchor: "products", homeCrumb: "الرئيسية" },
};
