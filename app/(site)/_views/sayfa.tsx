// Kayıt defterinden çizilen dillerin (de, es, fr) ortak sayfası. Hangi
// sayfanın hangi görünümle çizileceği TR/EN sayfa dosyalarıyla aynı;
// kural burada tek yerde. Gerekçe: _content/sayfalar.ts.
import { siteMetadata } from "@/lib/site/metadata";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import type { Locale, PageId } from "@/lib/site/routes";
import type { SayfaIcerikleri } from "../_content/sayfalar";
import { ContactView, toInterest } from "./contact";
import { HomeView } from "./home";
import { LegalView } from "./legal";
import { PricingView } from "./pricing";
import { PrivacyView } from "./privacy";
import { ProductView } from "./product";
import { SubView } from "./sub";

type Arama = Promise<Record<string, string | string[] | undefined>>;

export function sayfaMetadata(id: PageId, locale: Locale, icerik: SayfaIcerikleri) {
  const meta = icerik[id].meta;
  return siteMetadata({ id, locale, title: meta.title, description: meta.description, absoluteTitle: id === "home" });
}

export async function Sayfa({ id, locale, icerik, searchParams }: { id: PageId; locale: Locale; icerik: SayfaIcerikleri; searchParams?: Arama }) {
  switch (id) {
    case "home":
      return <HomeView locale={locale} c={icerik.home} />;
    case "arvoos":
    case "arvolab":
    case "randevu":
      return <ProductView locale={locale} c={icerik[id]} />;
    case "pricing":
      return <PricingView locale={locale} c={icerik.pricing} fiyatlar={await yayimlananFiyatlar()} />;
    case "contact": {
      const sp = searchParams ? await searchParams : {};
      return <ContactView locale={locale} c={icerik.contact} interest={toInterest(sp.interest ?? sp.ilgi)} />;
    }
    case "privacy":
      return <PrivacyView locale={locale} c={icerik.privacy} />;
    case "distance-sales":
    case "refund":
    case "delivery":
      return <LegalView locale={locale} id={id} c={icerik[id]} />;
    default:
      return <SubView locale={locale} c={icerik[id]} />;
  }
}
