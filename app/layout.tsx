import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./corporate.css";
import "./motion.css";
import ScrollEffects from "./scroll-effects";

// Tek yazı tipi: Apple cihazlarında sistemin kendi SF Pro'su (-apple-system),
// diğerlerinde ona en yakın açık yazı tipi Inter. SF Pro'nun lisansı web
// fontu olarak dağıtılmasına izin vermiyor. preload kapalı: Apple
// cihazları SF'yi bulduğu için Inter dosyasını hiç indirmez.
// Yığın globals.css'te (body --font-system).
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});
export const metadata: Metadata = {
  title: "Arvo | Ürünler ve Dijital Hizmetler",
  description: "ArvoOS, ArvoLab ve kurumlara özel dijital ürün, web tasarımı ve yazılım hizmetleri.",
  openGraph:{title:"Arvo | Akademik Çalışma Ekosistemi",description:"Akademik çalışmanın büyüyen ürün ekosistemi.",type:"website",images:[{url:"/arvoos-logo.png",alt:"Arvo Akademik Çalışma Ekosistemi"}]},
  twitter:{card:"summary_large_image",title:"Arvo | Akademik Çalışma Ekosistemi",description:"Akademik çalışmanın büyüyen ürün ekosistemi.",images:["/arvoos-logo.png"]},
  icons:{icon:"/favicon.svg",shortcut:"/favicon.svg",apple:"/favicon.svg"},
  manifest:"/manifest.webmanifest",
  appleWebApp:{capable:true,statusBarStyle:"default",title:"ArvoOS"},
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

export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="tr" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeInit}}/></head><body className={inter.variable}><ScrollEffects/>{children}</body></html>}
