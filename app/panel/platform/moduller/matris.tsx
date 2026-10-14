"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { KBaslik, KBos, KSatirSonu, KTablo } from "../konsol-ui";
// Hücre bağlantısı (.plt-matris-hucre) ve "yalnızca müşteriler" kutusu konsolun stilinde.
import "../platform.css";

const ADRES = "/panel/platform/moduller";

/*
  Kiracı × modül matrisi.

  Tablo okunurdu ama taranamıyordu:

    1. Her hücrede durumun TAM ADI yazıyordu ("Ödeme gecikmiş"). Dört
       sütun × uzun etiket, tabloyu yatay kaydırma gerektiren bir şeride
       çeviriyordu; asıl sorulan soru ise "hangi hücre yeşil değil".
       Etiketler kısaldı, altta bir açıklama şeridi var.
    2. Süzgeç yoktu. "Kimin Randevu'su kapalı" sorusunun yanıtı bütün
       satırları gözle taramaktı.
    3. Hücreler ölüydü. Kurucu bir sorun görünce o kiracının lisans
       ekranına gitmek için adresi elle kuruyordu; hücre artık oraya
       götürüyor.

  Matris hâlâ OKUNUR, düzenlenmez. Aynı kuralı iki yerde uygulamak birinin
  sapması demek — bunu billing_invoices ve billing_subscriptions ile
  yaşadık.
*/

export type MatrisUrunu = { code: string; name: string };
export type MatrisHucresi = { durum: string; durumAdi: string; tone: string; kisaAd: string; acik: boolean; bagimsiz: boolean };
export type MatrisSatiri = {
  id: string;
  ad: string;
  kendiMarkamiz: boolean;
  hucreler: Record<string, MatrisHucresi>;
};

type Suzgec = "hepsi" | "kapali" | "bagimsiz";

/** Türkçe duyarsız arama: "İş" ile "is" eşleşsin. */
const sadelestir = (value: string) =>
  value.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").trim();

const SUZGECLER = [
  { kod: "hepsi", ad: "Hepsi" },
  { kod: "kapali", ad: "Kapalı modülü olanlar" },
  { kod: "bagimsiz", ad: "Bağımsız çalışanlar" },
] as const;

/** Süzgeç kuralı tek yerde: hem tablo hem çipteki sayı buradan. */
const suzgeceUyar = (satir: MatrisSatiri, urunler: MatrisUrunu[], suzgec: Suzgec) => {
  const hucreler = urunler.map((urun) => satir.hucreler[urun.code]).filter(Boolean);
  if (suzgec === "kapali" && hucreler.every((hucre) => hucre.acik)) return false;
  if (suzgec === "bagimsiz" && !hucreler.some((hucre) => hucre.bagimsiz)) return false;
  return true;
};

export function Matris({ urunler, satirlar, durum }: {
  urunler: MatrisUrunu[];
  satirlar: MatrisSatiri[];
  /** ?suzgec= — geçersizse "hepsi". */
  durum?: string;
}) {
  const [arama, setArama] = useState("");
  /* 14.10.2026: süzgeç adreste (?suzgec=), panelin çip satırı bağlantı.
     Eskiden yalnızca bellekteydi; sayfa yenilenince kayboluyordu. */
  const suzgec: Suzgec = SUZGECLER.some((secim) => secim.kod === durum) ? (durum as Suzgec) : "hepsi";
  const [yalnizMusteri, setYalnizMusteri] = useState(false);

  const gorunen = useMemo(() => {
    const anahtar = sadelestir(arama);
    return satirlar.filter((satir) => {
      if (yalnizMusteri && satir.kendiMarkamiz) return false;
      if (!suzgeceUyar(satir, urunler, suzgec)) return false;
      if (!anahtar) return true;
      return sadelestir(satir.ad).includes(anahtar);
    });
  }, [satirlar, urunler, arama, suzgec, yalnizMusteri]);

  return (
    /* Parça (fragment), sarmalayıcı yok: liste sayfasında kaydırma kartın
       doğrudan çocuğu olan tabloda (.talep-bilgi > .talep-tablo). */
    <>
      <div className="ekip-suzgec talep-suzgec" role="group" aria-label="Süzgeç">
        {/* Çipler rayda (konsol-ui.css): telefonda tek sıra kaydırılır,
            masaüstünde sarmalayıcı display:contents ile görünmez. */}
        <div className="suzgec-ray">
        {SUZGECLER.map((secim) => (
          <Link
            key={secim.kod} href={secim.kod === "hepsi" ? ADRES : `${ADRES}?suzgec=${secim.kod}`}
            className={suzgec === secim.kod ? "is-active" : undefined} aria-current={suzgec === secim.kod ? "page" : undefined}
          >
            {secim.ad} <small>{satirlar.filter((satir) => (!yalnizMusteri || !satir.kendiMarkamiz) && suzgeceUyar(satir, urunler, secim.kod)).length}</small>
          </Link>
        ))}
        </div>
        {/* Kendi markalarımız sayımda zaten yok; tabloda gizlemek ayrı bir
            tercih, çünkü bazen tam da onlara bakmak gerekiyor. */}
        <label className="plt-matris-onay">
          <input type="checkbox" checked={yalnizMusteri} onChange={(olay) => setYalnizMusteri(olay.target.checked)} />
          <span>Yalnızca müşteriler</span>
        </label>
        <div className="talep-ara" role="search">
          <input type="search" value={arama} placeholder="Kiracı ara" aria-label="Kiracı ara" onChange={(olay) => setArama(olay.target.value)} />
        </div>
      </div>

      {gorunen.length ? (
        /* Konsolun öbür listeleri iOS satırına geçti (KListe/KOge,
           14.10.2026); bu matris BİLEREK tablo kalıyor. Satır başına dört
           ürün hücresi var ve soru sütun boyunca okunuyor ("kimin
           Randevu'su yeşil değil"): tek satırlık özete sıkıştırınca o
           dikey tarama kayboluyor. */
        <KTablo kolonlar={[{ ad: "Kiracı" }, ...urunler.map((urun) => ({ ad: urun.name })), { ad: "" }]}>
          {gorunen.map((satir) => {
            const kiraci = `/panel/platform/musteriler/${satir.id}?pencere=ayarlar`;
            return (
              <tr key={satir.id}>
                <KBaslik avatar etiket="Kiracı" href={kiraci} baslik={satir.ad} alt={satir.kendiMarkamiz ? "kendi markamız" : undefined} />
                {urunler.map((urun) => {
                  const hucre = satir.hucreler[urun.code];
                  if (!hucre) return <td key={urun.code} data-label={urun.name}>—</td>;
                  return (
                    <td key={urun.code} data-label={urun.name}>
                      {/* Hücre, o kiracının lisans ekranına götürüyor:
                          sorunu gören kurucu adresi elle kuruyordu. */}
                      <Link
                        className="plt-matris-hucre"
                        href={`/panel/platform/musteriler/${satir.id}?pencere=lisanslar`}
                        title={`${satir.ad} · ${urun.name}: ${hucre.durumAdi}${hucre.bagimsiz ? " · bağımsız" : ""}`}
                      >
                        <span className="status-pill" data-tone={hucre.tone}>{hucre.kisaAd}</span>
                        {hucre.bagimsiz ? <span className="crm-table-sub">bağımsız</span> : null}
                      </Link>
                    </td>
                  );
                })}
                <KSatirSonu mobil={{
                  href: kiraci,
                  baslik: satir.ad,
                  alt: [satir.kendiMarkamiz ? "kendi markamız" : null],
                  /* Telefonda dört hücre tek satırda işaret olarak: soru yine
                     "hangisi yeşil değil". */
                  isaretler: urunler.map((urun) => {
                    const hucre = satir.hucreler[urun.code];
                    return hucre ? { metin: `${urun.name}: ${hucre.kisaAd}${hucre.bagimsiz ? " · bağımsız" : ""}`, ton: hucre.acik ? "basari" as const : "uyari" as const } : null;
                  }),
                }} />
              </tr>
            );
          })}
        </KTablo>
      ) : (
        <KBos baslik="Eşleşen kurum yok" aciklama="Bu süzgeçle ya da aramayla eşleşen kurum yok." />
      )}
    </>
  );
}
