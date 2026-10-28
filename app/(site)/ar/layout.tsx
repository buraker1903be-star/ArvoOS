import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { DilHatirla } from "../_components/dil-hatirla";
import { SiteFooter } from "../_components/footer";
import { SiteHeader } from "../_components/header";

// Arapça sayfalar (/ar, 28.10.2026). Kök <html lang="tr"> panel için
// statik kalsın diye içerik dili bu sarmalayıcıyla belirtilir.
// Inter'de Arapça harf yok: yazı tipi verilmezse tarayıcı sistemin Arapça
// fontuna düşer ve site Mac ile Windows'ta yine farklı görünür (Inter'e
// geçilme sebebi buydu). Yalnızca bu yerleşimde yüklenir; öteki dillerin
// sayfaları dosyayı indirmez. Yalnızca Arapça alt kümesi yükleniyor: Latin
// harfler (ürün adları, rakamlar) bu dosyada yok, yığındaki Inter'e düşüyor
// ve öteki dillerle aynı çiziliyor (site-base.css). Inter önde olsaydı
// Arapça harfler onun yedeği Arial'dan gelirdi — o da sisteme göre değişir.
const arapca = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arapca",
  display: "swap",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="ar" dir="rtl" className={arapca.variable}>
      <a className="skip" href="#main">الانتقال إلى المحتوى</a>
      <SiteHeader locale="ar" />
      <main id="main">{children}</main>
      <SiteFooter locale="ar" />
      <DilHatirla locale="ar" />
    </div>
  );
}
