import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
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
  title: "Arvo | Ürünler ve Dijital Hizmetler",
  description: "ArvoOS, ArvoLab ve kurumlara özel dijital ürün, web tasarımı ve yazılım hizmetleri.",
  openGraph:{title:"Arvo | Akademik Çalışma Ekosistemi",description:"Akademik çalışmanın büyüyen ürün ekosistemi.",type:"website",images:[{url:"/arvoos-logo.png",alt:"Arvo Akademik Çalışma Ekosistemi"}]},
  twitter:{card:"summary_large_image",title:"Arvo | Akademik Çalışma Ekosistemi",description:"Akademik çalışmanın büyüyen ürün ekosistemi.",images:["/arvoos-logo.png"]},
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
    orada "Arvo"), dolayısıyla modern adı o sayfalarda yalnızca bu
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
const themeInit = `(function(){try{var t=localStorage.getItem("arvoos.theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="tr" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeInit}}/></head><body className={inter.variable}>{children}</body></html>}
