import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import "./corporate.css";
import "./motion.css";
import ScrollEffects from "./scroll-effects";

const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-manrope",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Arvo | Ürünler ve Dijital Hizmetler",
  description: "ArvoOS, ArvoLab ve kurumlara özel dijital ürün, web tasarımı ve yazılım hizmetleri.",
  openGraph:{title:"Arvo | Akademik Çalışma Ekosistemi",description:"Akademik çalışmanın büyüyen ürün ekosistemi.",type:"website",images:[{url:"/arvoos-logo.png",alt:"Arvo Akademik Çalışma Ekosistemi"}]},
  twitter:{card:"summary_large_image",title:"Arvo | Akademik Çalışma Ekosistemi",description:"Akademik çalışmanın büyüyen ürün ekosistemi.",images:["/arvoos-logo.png"]},
  icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="tr"><body className={manrope.variable}><ScrollEffects/>{children}</body></html>}
