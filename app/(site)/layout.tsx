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
import "./site-polish.css";

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

export const viewport: Viewport = { themeColor: "#050c1a" };

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      {children}
      <RevealObserver />
      <TiltObserver />
    </div>
  );
}
