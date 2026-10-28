// Açılış sahnesi: eğik başlayıp kaydırdıkça düzleşen katmanlı arayüz.
// ArvoOS: panel + e-imza kartı + PWA müşteri portalı. ArvoLab: ana pencere +
// ürüne özgü yüzen kart. Hepsi "Örnek arayüz" olarak etiketlidir.
import type { Locale } from "@/lib/site/routes";
import { FloatCard, SignCard } from "./float-card";
import { LabMock } from "./mock-lab";
import { OsPanelMock } from "./mock-os";
import { PhoneFrame } from "./mock-phone";

const CARDS = {
  tr: {
    lab: { kicker: "Kılavuz kontrolü", status: "Hazır", title: "Tez taslağı · 3. bölüm", sub: "Son kontrol birkaç saniye önce", rows: [["Başlık yapısı", "ok"], ["Kaynakça biçimi", "ok"], ["Tablo numaraları", "warn"]] as [string, "ok" | "warn"][] },
  },
  en: {
    lab: { kicker: "Guideline check", status: "Ready", title: "Thesis draft · chapter 3", sub: "Last checked a few seconds ago", rows: [["Heading structure", "ok"], ["Reference style", "ok"], ["Table numbering", "warn"]] as [string, "ok" | "warn"][] },
  },
} as const;

export function HeroStage({ locale, product = "arvoos" }: { locale: Locale; product?: "arvoos" | "arvolab" }) {
  const c = CARDS[locale];
  return (
    <div className="hero-stage">
      <div className="tilt">
        <div className="layers" data-product={product}>
          <div className="layer-main">
            {product === "arvoos" ? <OsPanelMock locale={locale} /> : <LabMock locale={locale} />}
          </div>
          {product === "arvoos" ? (
            <>
              <div className="layer-float layer-sign"><div className="bob"><SignCard locale={locale} /></div></div>
              <div className="layer-float layer-phone"><div className="bob bob-b"><PhoneFrame locale={locale} /></div></div>
            </>
          ) : (
            <div className="layer-float layer-card"><div className="bob"><FloatCard {...c.lab} /></div></div>
          )}
        </div>
      </div>
    </div>
  );
}
