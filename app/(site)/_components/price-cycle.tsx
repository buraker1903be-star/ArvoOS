"use client";
import { useState, type ReactNode } from "react";

/*
  Ücretler sayfasının kumanda çubuğu: ürün sekmeleri + aylık/yıllık.

  DÖRT ÜRÜNÜN ON İKİ BASAMAĞI ALT ALTA DURUYORDU. Sayfa masaüstünde
  7.858px, telefonda 13.205px'ti (ölçüldü); fiyat karşılaştırmak için
  gelen kişi on dört ekran kaydırıyordu. Artık tek seferde bir ürünün
  üç basamağı görünüyor.

  Seçim CSS'e `data-` ile geçiyor, React ağacına değil: bütün gruplar
  sunucuda basılıyor ve DOM'da kalıyor, yalnızca CSS ile gizleniyor.

  JAVASCRIPT KAPALIYKEN SEKMELER ÇALIŞMAZ ve sayfa sunucuda basılan
  ilk ürüne kilitli kalırdı: tarayıcıda ölçtüm, JS kapalı sayfada dört
  gruptan yalnızca biri görünüyordu — JS'siz ziyaretçi öteki üç ürünün
  fiyatını hiç göremiyordu. İlk durumu boş bırakıp mount'ta yazmak da
  çözüm değil: o zaman herkes bir an on iki kartı görüp üçe düşmesini
  izliyor. Bunun yerine <noscript> gizlemeyi tamamen kapatıyor —
  JS varsa sekmeli ve sıkı, JS yoksa tek sayfada her şey.
*/
export type UrunSekmesi = { code: string; label: string };

export function PriceCycle({
  monthly, yearly, badge, label, products, productsLabel, children,
}: {
  monthly: string; yearly: string; badge: string; label: string;
  products: UrunSekmesi[]; productsLabel: string; children: ReactNode;
}) {
  const [yillik, setYillik] = useState(false);
  const [urun, setUrun] = useState(products[0]?.code ?? "");
  return (
    <div className="pricing" data-cycle={yillik ? "yearly" : "monthly"} data-urun={urun || undefined}>
      <div className="pricing-bar">
        <div className="urun-tabs" role="tablist" aria-label={productsLabel}>
          {products.map((p) => (
            <button
              key={p.code}
              type="button"
              role="tab"
              className="urun-tab"
              aria-selected={urun === p.code}
              onClick={() => setUrun(p.code)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="cycle" role="group" aria-label={label}>
          <button type="button" className="cycle-btn" aria-pressed={!yillik} onClick={() => setYillik(false)}>
            {monthly}
          </button>
          <button type="button" className="cycle-btn" aria-pressed={yillik} onClick={() => setYillik(true)}>
            {yearly}
            <span className="cycle-badge">{badge}</span>
          </button>
        </div>
      </div>
      {children}

      {/*
        JS yoksa: kumanda çubuğu işe yaramadığı için gizlenir, bütün
        ürün grupları ve hem aylık hem yıllık tutar açılır. Kurallar
        `.site` önekiyle yazılmalı — site-pricing.css'teki gizleme
        kuralları da o önekle ve aynı özgüllükte.
      */}
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            "<style>" +
            ".site .pricing-bar{display:none}" +
            ".site .pricing[data-urun] .pgroup{display:block}" +
            ".site .pricing[data-urun] .pgroup+.pgroup{margin-top:56px}" +
            ".site .pricing[data-cycle] .price-m,.site .pricing[data-cycle] .price-y{display:inline-flex}" +
            "</style>",
        }}
      />
    </div>
  );
}
