import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getLoginBrand } from "@/lib/login-branding";
import { isManagementHost } from "@/lib/site/host-rules";
import { kurumSimgeleri } from "@/lib/kurum-simgesi";

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
/*
  KURUCU KONSOLU KENDİ ADIYLA KURULUR (15.10.2026).

  Manifest kiracının kendi alan adında onun adını ve simgesini veriyor
  (aşağıdaki not), ama yonetim.arvo-os.com bir kiracı alan adı değil:
  getLoginBrand orada null dönüyor ve kısayol "ArvoOS" adıyla
  kuruluyordu — app.arvo-os.com'daki kiracı paneliyle BİREBİR aynı ad ve
  aynı simge. İkisini birden ana ekranına ekleyen (kurucunun kendisi)
  hangisinin konsol olduğunu simgeden ayırt edemiyordu.

  Kısayollar da yalnızca burada: konsolun üç sık işi (müşteriler, ödeme
  onayları, sistem sağlığı) simgeye basılı tutunca çıkıyor. Kiracı
  panelinde aynı yollar yok.
*/
const YONETIM_KISAYOLLARI = [
  { name: "Müşteriler", short_name: "Müşteriler", url: "/panel/platform/musteriler" },
  { name: "Ödeme onayları", short_name: "Ödemeler", url: "/panel/platform/payments" },
  { name: "Sistem sağlığı", short_name: "Sağlık", url: "/panel/platform/saglik" },
];

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const yonetim = isManagementHost((await headers()).get("host") ?? "");
  // getLoginBrand yönetim alan adında zaten null dönüyor (lib/login-branding).
  const marka = await getLoginBrand();
  return {
    id: "/panel",
    name: yonetim ? "Arvo Yönetim Merkezi" : marka?.name ?? "ArvoOS",
    short_name: yonetim ? "Yönetim" : marka?.name ?? "ArvoOS",
    description: yonetim
      ? "Arvo kurucu konsolu: müşteriler, lisanslar, tahsilat ve sistem sağlığı."
      : marka ? `${marka.name} mobil yönetim ve operasyon merkezi.` : "Kurumunuzun mobil yönetim ve operasyon merkezi.",
    ...(yonetim ? { shortcuts: YONETIM_KISAYOLLARI } : {}),
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
      // Logo değil kare simge (12.10.2026): yatay logo ana ekranda da sıkışıyordu.
      // Bizim adresimizden: kurumun yüklediği simge ya da baş harfi (app/kurum-simgesi).
      ...(marka ? [{ src: kurumSimgeleri(marka).icon, sizes: "any", purpose: "any" as const }] : []),
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
