"use client";

import { useEffect, useState, type ReactNode } from "react";

/*
  GENEL BAKIŞ: SAYFA KAYMAZ, KART KAYAR (10.11.2026, ürün kuralı).

  Kural: ana ekran ve genel bakışlar hiçbir boyutta sayfa düzeyinde
  kaymaz; uzun içerik yalnızca kendi kartının içinde dikey kayar.

  Eskiden kartlar sayfa boyunca yığılıyordu: masaüstünde altı satırlık bir
  aşama kartı kardeşlerinin altında boşluk bırakıyor (NAV-02), telefonda
  Bugün paneli + grafik + dört liste ekranın beş katı uzunluğa çıkıyordu.

  - Masaüstü (≥901px): üstteki paneller (kurulum, grafik) doğal boyunda;
    liste kartları kalan yüksekliği paylaşır, her kartın gövdesi kendi
    içinde kayar, başlığı ve alt bağlantısı yerinde durur (dashboard.css ·
    .dash-sabit).
  - Telefon ve dar tablet (≤900px): kartlar yığılmaz; üstte görünüm
    seçici, altında seçili panel ekranın kalanını doldurur.

  Paneller sunucuda çiziliyor (veri sunucuda okunur); burası yalnızca
  hangisinin görüneceğini seçiyor — görünüm değişince yeniden sorgu yok.
*/
export type GorunumPaneli = {
  anahtar: string;
  etiket: string;
  /** "ust": tam genişlik, doğal boy (grafik, kurulum). "liste": kalan yüksekliği paylaşan kart. */
  yer: "ust" | "liste";
  /** Yalnızca telefonda (≤760px) olan panel (Bugün). */
  sadeceTelefon?: boolean;
  /*
    Aynı gruptaki liste panelleri masaüstünde TEK sütunda alt alta durur
    (FX-02: müşteri mesajları + posta = iletişim sütunu); her biri içeriği
    kadar, toplamı sütunu aşarsa her kart kendi gövdesinde kayar.
    Görünüm seçicide (dar/kısa ekran) yine ayrı ayrı seçilir.
  */
  grup?: string;
  icerik: ReactNode;
};

export function GorunumSecici({ paneller, etiket }: { paneller: GorunumPaneli[]; etiket: string }) {
  const [secili, setSecili] = useState(paneller[0]?.anahtar ?? "");

  /* Telefona özel panel seçiliyken ekran genişlerse (döndürme, tablet)
     görünmeyen bir paneli seçili bırakmayalım. */
  useEffect(() => {
    const sorgu = window.matchMedia("(min-width:761px)");
    const denetle = () => {
      if (!sorgu.matches) return;
      setSecili((onceki) => (paneller.find((p) => p.anahtar === onceki)?.sadeceTelefon ? (paneller.find((p) => !p.sadeceTelefon)?.anahtar ?? onceki) : onceki));
    };
    denetle();
    sorgu.addEventListener("change", denetle);
    return () => sorgu.removeEventListener("change", denetle);
  }, [paneller]);

  const panel = (p: GorunumPaneli) => (
    <div
      key={p.anahtar}
      id={`gorunum-${p.anahtar}`}
      className={["dash-gorunum-panel", p.anahtar === secili ? "is-secili" : "", p.sadeceTelefon ? "is-telefon" : "", `is-${p.yer}`].filter(Boolean).join(" ")}
    >
      {p.icerik}
    </div>
  );

  return (
    <div className="dash-gorunum">
      {paneller.length > 1 ? (
        <div className="dash-gorunum-sec" role="group" aria-label={etiket}>
          {paneller.map((p) => (
            <button
              key={p.anahtar}
              type="button"
              className={p.sadeceTelefon ? "is-telefon" : undefined}
              aria-pressed={p.anahtar === secili}
              aria-controls={`gorunum-${p.anahtar}`}
              onClick={() => setSecili(p.anahtar)}
            >
              {p.etiket}
            </button>
          ))}
        </div>
      ) : null}
      {paneller.filter((p) => p.yer === "ust").map(panel)}
      <div className="dash-cols dash-cols--esnek dash-cols--sabit">{listeOgeleri(paneller.filter((p) => p.yer === "liste"), panel)}</div>
    </div>
  );
}

/** Liste panelleri sırasıyla; aynı gruptakiler ilk göründükleri yerde tek sütunda. */
function listeOgeleri(liste: GorunumPaneli[], panel: (p: GorunumPaneli) => ReactNode): ReactNode[] {
  const ogeler: ReactNode[] = [];
  const islenen = new Set<string>();
  for (const p of liste) {
    if (!p.grup) { ogeler.push(panel(p)); continue; }
    if (islenen.has(p.grup)) continue;
    islenen.add(p.grup);
    ogeler.push(
      <div key={`grup-${p.grup}`} className="dash-gorunum-yigin">
        {liste.filter((q) => q.grup === p.grup).map(panel)}
      </div>,
    );
  }
  return ogeler;
}
