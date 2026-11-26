import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { TEMA_BETIGI } from "@/lib/konsol-giris/tema";
import { YANMENU_BETIGI } from "@/lib/konsol/gezinme";
import "./globals.css";
// Pazarlama sitesinin stilleri ve hareketleri app/(site)/layout.tsx'te;
// kök yerleşim yalnızca uygulama geneli temeli yükler.

// Tek yazı tipi: her sistemde Inter (28.10.2026). Eskiden Apple
// cihazlarında SF Pro çiziliyordu ve site Mac ile Windows'ta farklı
// görünüyordu (gerekçe globals.css). preload açık: artık her cihaz bu
// dosyayı indiriyor; eskiden kapalıydı çünkü Mac SF'yi bulup Inter'i hiç
// istemiyordu. Yığın globals.css'te (body --font-system).
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});
export const metadata: Metadata = {
  // Göreli paylaşım görseli yolları arvo-os.com'a göre çözülür (panel ve
  // belge sayfaları zaten dizine kapalı; site sayfaları kendi görselini verir).
  metadataBase: new URL("https://arvo-os.com"),
  title: "ArvoOS | Ürünler ve Dijital Hizmetler",
  description: "ArvoOS, ArvoLab ve kurumlara özel dijital ürün, web tasarımı ve yazılım hizmetleri.",
  openGraph:{title:"ArvoOS | Ürünler ve Dijital Hizmetler",description:"ArvoOS, ArvoLab ve ArvoCal ile kurumlara özel dijital ürün ve hizmetler.",type:"website",images:[{url:"/arvoos-logo.png",alt:"ArvoOS"}]},
  twitter:{card:"summary_large_image",title:"ArvoOS | Ürünler ve Dijital Hizmetler",description:"ArvoOS, ArvoLab ve ArvoCal ile kurumlara özel dijital ürün ve hizmetler.",images:["/arvoos-logo.png"]},
  // iOS ana ekran ikonu SVG kabul etmez: 180px opak PNG (köşeleri iOS yuvarlar)
  icons:{icon:"/favicon.svg",shortcut:"/favicon.svg",apple:{url:"/apple-touch-icon.png",sizes:"180x180",type:"image/png"}},
  manifest:"/manifest.webmanifest",
  applicationName:"ArvoOS",
  // Ana ekrandan açılınca tarayıcı çubuğu olmadan (iOS + Android/Chrome).
  // Durum çubuğu "default": açık temada koyu yazı; "black-translucent"
  // yazıyı beyaza zorlayıp açık üst çubukta okunmaz yapıyordu.
  appleWebApp:{capable:true,statusBarStyle:"default",title:"ArvoOS"},
  /*
    ESKİ iOS İÇİN `apple-` ÖNEKLİ SATIR (15.10.2026). Next,
    appleWebApp.capable'dan yalnızca modern `mobile-web-app-capable`
    meta'sını basıyor; Safari o adı ancak iOS 17.4'ten beri tanıyor.
    Daha eski bir iPhone'da ana ekrana eklenen panel tarayıcı çubuğuyla
    açılıyordu — kurulu uygulama hissi tam da orada kayboluyor.

    İKİSİ BİRDEN yazılıyor. Önce yalnızca `apple-` öneklisi yazıldı,
    "modern adı Next zaten basıyor" diye; doğru değilmiş. Next onu
    appleWebApp.capable'dan basıyor ama `(site)` düzeni pazarlama
    sayfalarında appleWebApp'i kendi değerleriyle EZİYOR (sekme adı
    orada "ArvoOS"), dolayısıyla modern adı o sayfalarda yalnızca bu
    satır sağlıyordu ve bir süre hiç yazılmadı. Panel yollarında meta
    iki kez çıkabilir; yinelenen meta zararsız, eksik olan değil.
  */
  other:{"apple-mobile-web-app-capable":"yes","mobile-web-app-capable":"yes"},
  formatDetection:{telephone:false}
};
export const viewport: Viewport = {
  width:"device-width",
  initialScale:1,
  viewportFit:"cover",
  themeColor:[
    {media:"(prefers-color-scheme: light)",color:"#f2f2f7"},
    {media:"(prefers-color-scheme: dark)",color:"#050c1a"},
  ],
};
// Tema, ThemeToggle tarafından localStorage'a yazılıyordu ama hiçbir yerde
// geri okunmuyordu; her sayfa yenilemesinde aydınlık moda dönüyordu.
// Bu script render'dan önce çalışır, böylece "flash" da olmaz.
//
// 26.11.2026: betik üç tercihli modele geçti (Açık / Koyu / SİSTEM,
// lib/konsol-giris/tema.ts). Eskisi yalnızca iki durum biliyordu:
// kullanıcı bir kez seçince "sisteme uy"a dönmenin yolu kalmıyor ve
// sistem teması gün içinde değişince (macOS/iOS otomatik koyu mod)
// açık sekme bunu izlemiyordu. Depolama anahtarı ve "light"/"dark"
// değerleri AYNI; kaydı olmayan kullanıcı "system" sayılır — eskiden
// aldığı davranışın aynısı. Betik <html>'e data-theme ile birlikte
// data-theme-tercih de yazar: tema seçicisi onu okur.

export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="tr" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:TEMA_BETIGI}}/><script dangerouslySetInnerHTML={{__html:YANMENU_BETIGI}}/></head><body className={inter.variable}>{children}</body></html>}
