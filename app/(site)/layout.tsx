import type { Metadata, Viewport } from "next";
import { SITE_ORIGIN } from "@/lib/site/routes";
import { RevealObserver } from "./_components/reveal";
import { TiltObserver } from "./_components/tilt";
import "./site-base.css";
import "./site-chrome.css";
import "./site-sections.css";
import "./site-blocks.css";
import "./site-product.css";
import "./site-mockups.css";
import "./site-brand.css";
import "./site-cinema.css";
import "./site-layers.css";
import "./site-story.css";
import "./site-bento.css";
import "./site-pricing.css";
import "./site-polish.css";
import "./site-home.css";

// arvo-os.com pazarlama sitesi kabuğu. Stil dosyaları yalnızca bu grupta
// yüklenir ve tüm kurallar .site altındadır: panel, giriş ve belge
// sayfalarına sızmaz. Üst menü / alt bilgi dil başına (tr)/layout ve
// en/layout içinde.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: "Arvo", template: "%s | Arvo" },
  applicationName: "Arvo",
  appleWebApp: { capable: false, title: "Arvo" },
  formatDetection: { telephone: false, email: false, address: false },
};

/*
  ARVO ANALİTİK (22.10.2026): arvo-os.com kendi Analitik modülümüzle
  izleniyor (Arvo kurumu → Analitik → Kurulum). Anahtar gizli değil;
  yalnızca hangi siteye yazılacağını söylüyor ve olay ucu kaynağın
  arvo-os.com olduğunu ayrıca denetliyor. Kod çerezsiz.
*/
const ANALITIK_ANAHTARI = "323fb17f38e54b24ba0caba9be3ef537";

export const viewport: Viewport = { themeColor: "#050c1a" };

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      {children}
      <RevealObserver />
      <TiltObserver />
      <script defer src="https://app.arvo-os.com/k.js" data-site={ANALITIK_ANAHTARI} />
    </div>
  );
}
