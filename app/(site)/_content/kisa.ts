// Görünümlerde tekrar eden kısa arayüz ifadeleri, dil başına tek yerde.
// Eskiden her görünüm `locale === "tr" ? … : …` yazıyordu; üçüncü dil
// eklenince bu kalıp sessizce İngilizce'ye düşüyordu. Record<Locale>
// eksik dili derlemede yakalıyor.
import type { Locale } from "@/lib/site/routes";

type Kisa = {
  crumb: string; more: string; details: string; signIn: string;
  billingPeriod: string; product: string; arvoosPages: string; productsAnchor: string;
};

export const KISA: Record<Locale, Kisa> = {
  en: { crumb: "Breadcrumb", more: "Learn more", details: "Learn more", signIn: "Sign in", billingPeriod: "Billing period", product: "Product", arvoosPages: "ArvoOS pages", productsAnchor: "products" },
  tr: { crumb: "İçerik yolu", more: "Daha fazla bilgi", details: "Detaylar", signIn: "Giriş", billingPeriod: "Ödeme dönemi", product: "Ürün", arvoosPages: "ArvoOS sayfaları", productsAnchor: "urunler" },
  de: { crumb: "Brotkrumen-Navigation", more: "Mehr erfahren", details: "Mehr erfahren", signIn: "Anmelden", billingPeriod: "Abrechnungszeitraum", product: "Produkt", arvoosPages: "ArvoOS-Seiten", productsAnchor: "produkte" },
  es: { crumb: "Ruta de navegación", more: "Más información", details: "Más información", signIn: "Iniciar sesión", billingPeriod: "Periodo de facturación", product: "Producto", arvoosPages: "Páginas de ArvoOS", productsAnchor: "productos" },
  fr: { crumb: "Fil d’Ariane", more: "En savoir plus", details: "En savoir plus", signIn: "Se connecter", billingPeriod: "Période de facturation", product: "Produit", arvoosPages: "Pages ArvoOS", productsAnchor: "produits" },
};
