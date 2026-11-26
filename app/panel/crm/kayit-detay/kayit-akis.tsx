"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  adresler,
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
  /**
   * Açılışta seçili sekme (adresten gelen derin bağlantı için).
   * `adresler` verildiğinde bu YALNIZCA bir başlangıç değil, seçimin
   * KENDİSİ olur: durum adreste.
   */
  baslangic?: number;
  /**
   * ADRESE BAĞLI SEKME (26.11.2026). Her sekmenin kendi adresi
   * verildiğinde şerit düğme değil BAĞLANTI çiziyor ve seçimi
   * `baslangic` söylüyor; bileşen kendi durumunu tutmuyor. Derin
   * bağlantı, yenileme ve tarayıcı geri/ileri böyle çalışıyor
   * (ürün detayı: ?bolum=abonelikler).
   *
   * Verilmezse eski davranış sürüyor: seçim bileşenin içinde, adres
   * değişmiyor. Panelin öteki kartları (talep, teklif, personel) bunu
   * kullanıyor; onların sekmeleri paylaşılabilir bir yer değil.
   */
  adresler?: string[];
  /**
   * Yalnızca İLK SEÇİLDİĞİNDE kurulan paneller. İş detayındaki müşteri
   * mesajları bunlardan: panel kurulunca mesajlar okundu sayılıyor ve
   * gizli panel de DOM'da kurulsaydı sayfayı açmak okumak sayılırdı
   * (eskiden sayfa içindeki mesaj bölümünde böyle oluyordu).
   */
  tembel?: number[];
  children: ReactNode;
}) {
  const router = useRouter();
  const adresli = Array.isArray(adresler) && adresler.length === sekmeler.length;
  const [yerelSecili, setYerelSecili] = useState(baslangic);
  /* Adresli modda seçim sunucudan geliyor; yerel durum okunmuyor. */
  const secili = adresli ? baslangic : yerelSecili;
  const [acilanlar, setAcilanlar] = useState(() => new Set([baslangic]));
  const sec = (sira: number) => {
    if (adresli) { router.push(adresler[sira]); return; }
    setYerelSecili(sira);
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
        {sekmeler.map((ad, sira) => {
          const ortak = {
            id: `${kimlik}-sekme-${sira}`,
            role: "tab" as const,
            "aria-selected": sira === secili,
            "aria-controls": `${kimlik}-panel-${sira}`,
            tabIndex: sira === secili ? 0 : -1,
            className: sira === secili ? "is-active" : undefined,
            /* Ok tuşları: odağı komşu sekmeye taşır. Düğme modunda
               seçim de hemen değişir (tek Tab durağı kalıbı); adresli
               modda SEÇİM DEĞİŞMEZ, çünkü her ok tuşu bir gezinme
               demek olurdu — kullanıcı Enter ile açar. */
            onKeyDown: (olay: React.KeyboardEvent) => {
              if (olay.key !== "ArrowRight" && olay.key !== "ArrowLeft") return;
              const sonraki = (sira + (olay.key === "ArrowRight" ? 1 : -1) + sekmeler.length) % sekmeler.length;
              if (!adresli) sec(sonraki);
              document.getElementById(`${kimlik}-sekme-${sonraki}`)?.focus();
            },
          };
          return adresli ? (
            <Link key={ad} href={adresler[sira]} {...ortak} tabIndex={0}>{ad}</Link>
          ) : (
            <button key={ad} type="button" {...ortak} onClick={() => sec(sira)}>{ad}</button>
          );
        })}
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
          {!adresli && tembel.includes(sira) && !acilanlar.has(sira) ? null : panel}
        </div>
      ))}
    </section>
  );
}
