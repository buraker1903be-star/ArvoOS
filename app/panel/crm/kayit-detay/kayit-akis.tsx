"use client";

import { Children, useState, type ReactNode } from "react";
import "./kayit-akis.css";

/*
  Kayıt detaylarının (talep, teklif) sağ sütunu: yorumlar, postalar ve
  kayıt geçmişi tek akışta, sekmelerle. Eskiden yorumlar ve postalar yan sütunda alt alta,
  kayıt geçmişi sol sütunun en altındaydı; sayfa 1400px boyuna çıkıyor,
  geçmişe ulaşmak için kaydırmak gerekiyordu.

  Panellerin içeriği sunucuda çiziliyor (her biri kendi verisini okuyor);
  burası yalnızca hangisinin görüneceğini seçer. Gizli paneller DOM'da
  kalır, sekme değişince yeniden yüklenmez.
*/
export function TalepAkis({
  sekmeler,
  baslangic = 0,
  tembel = [],
  kimlik = "talep",
  darSecici = false,
  sinif,
  etiket = "Talep akışı",
  children,
}: {
  sekmeler: string[];
  /**
   * Dar ve kısa pencerede sekme şeridi yerine TEK BİR seçici çizilir.
   * Bilerek opt-in: şerit panelin her yerinde kullanılıyor, seçiciyi
   * hepsine açmak bu teslimin kapsamı dışında. Açan sayfa seçicinin
   * CSS'ini de kendi dosyasında tanımlar (hangi genişlikte geçileceği
   * sayfanın düzenine bağlı).
   */
  darSecici?: boolean;
  /*
    Sekme ve panel kimliklerinin öneki. Personel detayında iki sekmeli
    kart yan yana duruyor (29.10.2026); önek sabitken iki kartın
    "talep-sekme-0"ı çakışıyor, ok tuşuyla odak öteki karta atlıyordu.
  */
  kimlik?: string;
  /** Karta eklenecek sınıf (sütuna özgü düzen için). */
  sinif?: string;
  etiket?: string;
  /** Açılışta seçili sekme (adresten gelen derin bağlantı için). */
  baslangic?: number;
  /**
   * Yalnızca İLK SEÇİLDİĞİNDE kurulan paneller. İş detayındaki müşteri
   * mesajları bunlardan: panel kurulunca mesajlar okundu sayılıyor ve
   * gizli panel de DOM'da kurulsaydı sayfayı açmak okumak sayılırdı
   * (eskiden sayfa içindeki mesaj bölümünde böyle oluyordu).
   */
  tembel?: number[];
  children: ReactNode;
}) {
  const [secili, setSecili] = useState(baslangic);
  const [acilanlar, setAcilanlar] = useState(() => new Set([baslangic]));
  const sec = (sira: number) => {
    setSecili(sira);
    setAcilanlar((onceki) => (onceki.has(sira) ? onceki : new Set(onceki).add(sira)));
  };
  const paneller = Children.toArray(children);
  return (
    <section className={sinif ? `talep-akis panel-card ${sinif}` : "talep-akis panel-card"}>
      {/*
        Dar pencerede aynı seçim tek bir açılır listeden yapılıyor:
        altı sekme 390 px'de üç satıra sarıyor ve kartın gövdesinden
        133 px yiyordu. İkisi birden çiziliyor, hangisinin görüneceğine
        CSS karar veriyor — seçim durumu tek ve ortak.
      */}
      {darSecici ? (
        <label className="talep-akis-sec">
          <select
            aria-label={etiket}
            value={secili}
            onChange={(olay) => sec(Number(olay.target.value))}
          >
            {sekmeler.map((ad, sira) => (
              <option key={ad} value={sira}>{ad}</option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="talep-akis-sekmeler" role="tablist" aria-label={etiket}>
        {sekmeler.map((ad, sira) => (
          <button
            key={ad}
            type="button"
            role="tab"
            id={`${kimlik}-sekme-${sira}`}
            aria-selected={sira === secili}
            aria-controls={`${kimlik}-panel-${sira}`}
            tabIndex={sira === secili ? 0 : -1}
            className={sira === secili ? "is-active" : undefined}
            onClick={() => sec(sira)}
            onKeyDown={(olay) => {
              if (olay.key !== "ArrowRight" && olay.key !== "ArrowLeft") return;
              const sonraki = (secili + (olay.key === "ArrowRight" ? 1 : -1) + sekmeler.length) % sekmeler.length;
              sec(sonraki);
              document.getElementById(`${kimlik}-sekme-${sonraki}`)?.focus();
            }}
          >
            {ad}
          </button>
        ))}
      </div>
      {paneller.map((panel, sira) => (
        <div
          key={sira}
          id={`${kimlik}-panel-${sira}`}
          role="tabpanel"
          aria-labelledby={`${kimlik}-sekme-${sira}`}
          hidden={sira !== secili}
          className="talep-akis-panel"
        >
          {tembel.includes(sira) && !acilanlar.has(sira) ? null : panel}
        </div>
      ))}
    </section>
  );
}
