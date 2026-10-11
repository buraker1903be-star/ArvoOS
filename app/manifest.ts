import type { MetadataRoute } from "next";
import { getLoginBrand } from "@/lib/login-branding";

// Ana ekrana eklenen panel: tarayıcı çubuğu olmadan (standalone) açılır.
// Renkler panel-tokens.css'teki iOS zemini (#f2f2f7) ile aynı; açılış
// ekranı ile panel arasında renk sıçraması olmaz. Yön serbest: tablette
// yatay kullanım da destekleniyor (eskiden dikeye kilitliydi).
/*
  ANA EKRAN KISAYOLU DA KURUMUN (11.10.2026).

  Kiracı paneli telefonunun ana ekranına eklediğinde kısayolun adı
  "ArvoOS" ve simgesi Arvo'nun logosuydu; ürün beyaz etiketli
  satılırken kurumun ekibi her gün başka bir markaya basıyordu.

  Ölçüt yine ADRES: kurum kendi alan adındaysa onun adı ve logosu.
  Paylaşılan adreste (app.arvo-os.com) ArvoOS kalıyor.

  Logo PNG/JPG/WEBP olabiliyor ve ölçüsü bilinmiyor: "any" amacıyla
  tek boyutsuz giriş olarak ekleniyor, Arvo'nun hazır 192/512
  sürümleri de listede kalıyor — tarayıcı uygun olanı seçsin, hiçbiri
  olmazsa boş simge kalmasın.
*/
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const marka = await getLoginBrand();
  return {
    id: "/panel",
    name: marka?.name ?? "ArvoOS",
    short_name: marka?.name ?? "ArvoOS",
    description: marka ? `${marka.name} mobil yönetim ve operasyon merkezi.` : "Kurumunuzun mobil yönetim ve operasyon merkezi.",
    lang: "tr",
    dir: "ltr",
    start_url: "/panel",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#f2f2f7",
    theme_color: "#f2f2f7",
    orientation: "any",
    categories: ["business", "productivity"],
    // PNG'ler: Android ana ekran + açılış ekranı 192/512 ister; maskable
    // sürümde logo güvenli alanda (%80 daire) kalır, kenarlar kırpılabilir.
    icons: [
      ...(marka?.logo_url ? [{ src: marka.logo_url, sizes: "any", purpose: "any" as const }] : []),
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
