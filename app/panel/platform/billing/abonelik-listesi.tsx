"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/*
  Kurum abonelikleri: KİRACI BAZINDA gruplu.

  Liste kiracı × ürün düz sıralamasıydı ve aynı kurumun üç aboneliği
  listenin üç ayrı yerine dağılıyordu. "AkademikMerkez bize ayda ne
  ödüyor" sorusunun yanıtı hiçbir satırda yazmıyordu; kurucu satırları
  gözüyle toplayıp buluyordu.

  Artık her kurum bir grup ve grup başlığında AYLIK TOPLAMI yazıyor.
  Sıralama da gelire göre: bir finans ekranında ilk bakılan şey "en çok
  kim ödüyor". Süzgeç ve arama, kalabalıklaştığında listenin taranabilir
  kalması için.

  Rakamlar sunucuda hesaplanıyor (page.tsx); burası yalnızca gösteriyor.
*/

export type AbonelikKalemi = {
  urun: string;
  urunAdi: string;
  durum: string;
  durumAdi: string;
  tone: string;
  planAdi: string | null;
  ucret: string | null;
  donemAdi: string;
  donemNotu: string;
};

export type AbonelikGrubu = {
  organizationId: string;
  ad: string;
  aylikToplam: number;
  aylikToplamAdi: string;
  kalemler: AbonelikKalemi[];
  odeyen: number;
  denemede: number;
  geciken: number;
};

const SUZGECLER = [
  { kod: "hepsi", ad: "Hepsi" },
  { kod: "odeyen", ad: "Ödeyen" },
  { kod: "deneme", ad: "Denemede" },
  { kod: "geciken", ad: "Ödemesi gecikmiş" },
  { kod: "ucretsiz", ad: "Ücreti girilmemiş" },
] as const;

/** Türkçe duyarsız arama: "İş" ile "is" eşleşsin. */
const sadelestir = (value: string) =>
  value.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").trim();

export function AbonelikListesi({ gruplar }: { gruplar: AbonelikGrubu[] }) {
  const [arama, setArama] = useState("");
  const [suzgec, setSuzgec] = useState<string>("hepsi");

  const gorunen = useMemo(() => {
    const anahtar = sadelestir(arama);
    return gruplar.filter((grup) => {
      if (suzgec === "odeyen" && !grup.odeyen) return false;
      if (suzgec === "deneme" && !grup.denemede) return false;
      if (suzgec === "geciken" && !grup.geciken) return false;
      if (suzgec === "ucretsiz" && !grup.kalemler.some((kalem) => !kalem.ucret)) return false;
      if (!anahtar) return true;
      return sadelestir(`${grup.ad} ${grup.kalemler.map((kalem) => kalem.urunAdi).join(" ")}`).includes(anahtar);
    });
  }, [gruplar, arama, suzgec]);

  const kalemSayisi = gorunen.reduce((toplam, grup) => toplam + grup.kalemler.length, 0);

  return (
    <div className="plt-abonelikler">
      <div className="plt-uye-arac">
        <label className="plt-abone-arama">
          <span className="plt-gizli">Kiracı ya da ürün ara</span>
          <input type="search" value={arama} placeholder="Kiracı ya da ürün ara" onChange={(olay) => setArama(olay.target.value)} />
        </label>
        <div className="plt-hizli" role="group" aria-label="Süzgeç">
          {SUZGECLER.map((secim) => (
            <button key={secim.kod} type="button" data-secili={suzgec === secim.kod} onClick={() => setSuzgec(secim.kod)}>
              {secim.ad}
            </button>
          ))}
        </div>
        <span className="plt-uye-sayi">{gorunen.length} kurum · {kalemSayisi} abonelik</span>
      </div>

      {gorunen.length ? (
        <div className="plt-abonelik-gruplar">
          {gorunen.map((grup) => (
            <section key={grup.organizationId} className="plt-abonelik-grup">
              <header>
                <span className="plt-abonelik-kim">
                  <b>{grup.ad}</b>
                  <small>
                    {grup.kalemler.length} abonelik
                    {grup.denemede ? ` · ${grup.denemede} denemede` : ""}
                    {grup.geciken ? ` · ${grup.geciken} gecikmiş` : ""}
                  </small>
                </span>
                {/* Aylık toplam başlıkta: "bu kurum bize ne ödüyor"
                    sorusunun yanıtı satırları gözle toplamak olmamalı.
                    Denemedekiler toplama girmiyor — henüz ödemiyorlar. */}
                <span className="plt-abonelik-toplam">
                  <b>{grup.aylikToplamAdi}</b>
                  <small>{grup.aylikToplam ? "aylık" : "tahsil edilen yok"}</small>
                </span>
                <Link className="kiraci-baglanti" href={`/panel/platform/licenses?organization=${grup.organizationId}`}>Lisans →</Link>
              </header>

              <div className="plt-abonelik-kalemler">
                {grup.kalemler.map((kalem) => (
                  <div key={kalem.urun} className="plt-abonelik-kalem">
                    <span className="plt-urun-etiketi" data-urun={kalem.urun}>{kalem.urunAdi}</span>
                    <span data-etiket="Paket" className="plt-abonelik-paket">{kalem.planAdi ?? "paket belirtilmedi"}</span>
                    {/* Ücreti girilmemiş abonelik ₺0 yazmıyor: sıfır ücret
                        bir fiyat, eksik ücret eksik bir kayıt. */}
                    <span data-etiket="Ücret" className="plt-abonelik-ucret" data-yok={!kalem.ucret}>
                      {kalem.ucret ?? "ücret girilmedi"}
                    </span>
                    <span data-etiket={kalem.donemNotu} className="plt-abonelik-donem">{kalem.donemAdi}</span>
                    <span data-etiket="Durum">
                      <span className="status-pill" data-tone={kalem.tone}>{kalem.durumAdi}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="plt-substatus plt-uye-bos">Bu süzgeçle eşleşen abonelik yok.</p>
      )}
    </div>
  );
}
