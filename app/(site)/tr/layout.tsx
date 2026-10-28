import { DilHatirla } from "../_components/dil-hatirla";
import { SiteFooter } from "../_components/footer";
import { SiteHeader } from "../_components/header";

// Türkçe sayfalar (/tr, 28.10.2026'ya kadar kökteydi). Kök yerleşim
// <html lang="tr"> yazıyor; sarmalayıcı yine de dili açıkça söylüyor,
// İngilizce yerleşimle simetrik olsun.
export default function TrLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="tr">
      <a className="skip" href="#main">İçeriğe geç</a>
      <SiteHeader locale="tr" />
      <main id="main">{children}</main>
      <SiteFooter locale="tr" />
      <DilHatirla locale="tr" />
    </div>
  );
}
