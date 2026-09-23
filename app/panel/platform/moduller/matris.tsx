"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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

export function Matris({ urunler, satirlar }: { urunler: MatrisUrunu[]; satirlar: MatrisSatiri[] }) {
  const [arama, setArama] = useState("");
  const [suzgec, setSuzgec] = useState<Suzgec>("hepsi");
  const [yalnizMusteri, setYalnizMusteri] = useState(false);

  const gorunen = useMemo(() => {
    const anahtar = sadelestir(arama);
    return satirlar.filter((satir) => {
      if (yalnizMusteri && satir.kendiMarkamiz) return false;
      const hucreler = urunler.map((urun) => satir.hucreler[urun.code]).filter(Boolean);
      if (suzgec === "kapali" && hucreler.every((hucre) => hucre.acik)) return false;
      if (suzgec === "bagimsiz" && !hucreler.some((hucre) => hucre.bagimsiz)) return false;
      if (!anahtar) return true;
      return sadelestir(satir.ad).includes(anahtar);
    });
  }, [satirlar, urunler, arama, suzgec, yalnizMusteri]);

  return (
    <div className="plt-matris">
      <div className="plt-uye-arac">
        <label className="plt-abone-arama">
          <span className="plt-gizli">Kiracı ara</span>
          <input type="search" value={arama} placeholder="Kiracı ara" onChange={(olay) => setArama(olay.target.value)} />
        </label>
        <div className="plt-hizli" role="group" aria-label="Süzgeç">
          {SUZGECLER.map((secim) => (
            <button key={secim.kod} type="button" data-secili={suzgec === secim.kod} onClick={() => setSuzgec(secim.kod)}>
              {secim.ad}
            </button>
          ))}
        </div>
        {/* Kendi markalarımız sayımda zaten yok; tabloda gizlemek ayrı bir
            tercih, çünkü bazen tam da onlara bakmak gerekiyor. */}
        <label className="plt-matris-onay">
          <input type="checkbox" checked={yalnizMusteri} onChange={(olay) => setYalnizMusteri(olay.target.checked)} />
          <span>Yalnızca müşteriler</span>
        </label>
        <span className="plt-uye-sayi">{gorunen.length} kurum</span>
      </div>

      {gorunen.length ? (
        <div className="plt-table-scroll">
          <table className="plt-table modul-capraz">
            <thead>
              <tr>
                <th>Kiracı</th>
                {urunler.map((urun) => <th key={urun.code}>{urun.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {gorunen.map((satir) => (
                <tr key={satir.id}>
                  <td>
                    <Link className="modul-baglanti" href={`/panel/platform?organization=${satir.id}`}>{satir.ad}</Link>
                    {satir.kendiMarkamiz ? <small className="plt-substatus">kendi markamız</small> : null}
                  </td>
                  {urunler.map((urun) => {
                    const hucre = satir.hucreler[urun.code];
                    if (!hucre) return <td key={urun.code}>—</td>;
                    return (
                      <td key={urun.code}>
                        {/* Hücre, o kiracının lisans ekranına götürüyor:
                            sorunu gören kurucu adresi elle kuruyordu. */}
                        <Link
                          className="plt-matris-hucre"
                          href={`/panel/platform/licenses?organization=${satir.id}`}
                          title={`${satir.ad} · ${urun.name}: ${hucre.durumAdi}${hucre.bagimsiz ? " · bağımsız" : ""}`}
                        >
                          <span className="status-pill" data-tone={hucre.tone}>{hucre.kisaAd}</span>
                          {hucre.bagimsiz ? <small className="plt-substatus">bağımsız</small> : null}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="plt-substatus plt-uye-bos">Bu süzgeçle eşleşen kurum yok.</p>
      )}
    </div>
  );
}
