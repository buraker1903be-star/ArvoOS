"use client";

import { Children, useState, type ReactNode } from "react";

/*
  Talep detayının sağ sütunu: yorumlar, postalar ve kayıt geçmişi tek
  akışta, sekmelerle. Eskiden yorumlar ve postalar yan sütunda alt alta,
  kayıt geçmişi sol sütunun en altındaydı; sayfa 1400px boyuna çıkıyor,
  geçmişe ulaşmak için kaydırmak gerekiyordu.

  Panellerin içeriği sunucuda çiziliyor (her biri kendi verisini okuyor);
  burası yalnızca hangisinin görüneceğini seçer. Gizli paneller DOM'da
  kalır, sekme değişince yeniden yüklenmez.
*/
export function TalepAkis({ sekmeler, children }: { sekmeler: string[]; children: ReactNode }) {
  const [secili, setSecili] = useState(0);
  const paneller = Children.toArray(children);
  return (
    <section className="talep-akis panel-card">
      <div className="talep-akis-sekmeler" role="tablist" aria-label="Talep akışı">
        {sekmeler.map((ad, sira) => (
          <button
            key={ad}
            type="button"
            role="tab"
            id={`talep-sekme-${sira}`}
            aria-selected={sira === secili}
            aria-controls={`talep-panel-${sira}`}
            tabIndex={sira === secili ? 0 : -1}
            className={sira === secili ? "is-active" : undefined}
            onClick={() => setSecili(sira)}
            onKeyDown={(olay) => {
              if (olay.key !== "ArrowRight" && olay.key !== "ArrowLeft") return;
              const sonraki = (secili + (olay.key === "ArrowRight" ? 1 : -1) + sekmeler.length) % sekmeler.length;
              setSecili(sonraki);
              document.getElementById(`talep-sekme-${sonraki}`)?.focus();
            }}
          >
            {ad}
          </button>
        ))}
      </div>
      {paneller.map((panel, sira) => (
        <div
          key={sira}
          id={`talep-panel-${sira}`}
          role="tabpanel"
          aria-labelledby={`talep-sekme-${sira}`}
          hidden={sira !== secili}
          className="talep-akis-panel"
        >
          {panel}
        </div>
      ))}
    </section>
  );
}
