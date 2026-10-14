"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { KBaslik, KBos, KDurum, KSatirSonu, KTablo } from "../konsol-ui";

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

  GÖRÜNÜŞ (14.10.2026, "bizim ArvoOS panel gibi olmalı"): kendi kutu
  düzeni (.plt-abonelik-grup) yerine panelin liste tablosu. Grup, kurum
  satırı + altında ürün satırları olarak çiziliyor; kurum satırının
  "Aylık" hücresi grubun toplamı. Süzgeç düğmeleri panelin çip satırı
  oldu ve adrese yazılıyor (?durum=): eskiden yalnızca bileşen
  durumundaydı, sayfa yenilenince ya da bağlantı paylaşılınca kayboluyordu.
  Çip satırı Ödeme sorunları ve Dönem sonu bölümlerini de taşıyor; o
  bölümlerin içeriği sunucudan `children` olarak geliyor.

  Bileşen bir parça (fragment) döndürüyor: liste sayfasında kaydırma
  kartın DOĞRUDAN çocuğu olan tablo kutusunda (os-shell.css .liste-sayfa),
  araya giren bir sarmalayıcı kaydırmayı bozardı.
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
  /** Askıya alınmış ya da iptal edilmiş abonelikler (toplama girmez). */
  kapali: number;
};

/** Çip satırında aboneliklerin yanında duran bölüm (Ödeme sorunları, Dönem sonu). */
export type AbonelikBolumu = { kod: string; ad: string; adet: number; uyari?: boolean };

const SUZGECLER = [
  { kod: "hepsi", ad: "Hepsi" },
  { kod: "odeyen", ad: "Ödeyen" },
  { kod: "deneme", ad: "Denemede" },
  { kod: "geciken", ad: "Ödemesi gecikmiş" },
  { kod: "ucretsiz", ad: "Ücreti girilmemiş" },
  { kod: "kapali", ad: "Askıda / iptal" },
] as const;

const ADRES = "/panel/platform/billing";

/** Türkçe duyarsız arama: "İş" ile "is" eşleşsin. */
const sadelestir = (value: string) =>
  value.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").trim();

const suzgeceUyar = (grup: AbonelikGrubu, suzgec: string) => {
  if (suzgec === "odeyen" && !grup.odeyen) return false;
  if (suzgec === "deneme" && !grup.denemede) return false;
  if (suzgec === "geciken" && !grup.geciken) return false;
  if (suzgec === "ucretsiz" && !grup.kalemler.some((kalem) => !kalem.ucret)) return false;
  if (suzgec === "kapali" && !grup.kapali) return false;
  return true;
};

export function AbonelikListesi({ gruplar, durum, bolum, bolumler, children }: {
  gruplar: AbonelikGrubu[];
  /** ?durum= — geçersizse "hepsi". */
  durum?: string;
  /** ?bolum= — boşsa abonelik listesi, değilse `children` çizilir. */
  bolum?: string;
  bolumler: AbonelikBolumu[];
  children?: ReactNode;
}) {
  const [arama, setArama] = useState("");
  const suzgec = SUZGECLER.some((secim) => secim.kod === durum) ? durum! : "hepsi";
  const abonelikGorunumu = !bolum;

  const gorunen = useMemo(() => {
    const anahtar = sadelestir(arama);
    return gruplar.filter((grup) => {
      if (!suzgeceUyar(grup, suzgec)) return false;
      if (!anahtar) return true;
      return sadelestir(`${grup.ad} ${grup.kalemler.map((kalem) => kalem.urunAdi).join(" ")}`).includes(anahtar);
    });
  }, [gruplar, arama, suzgec]);

  return (
    <>
      <div className="ekip-suzgec talep-suzgec" role="group" aria-label="Süzgeç">
        {SUZGECLER.map((secim) => {
          const aktif = abonelikGorunumu && suzgec === secim.kod;
          return (
            <Link key={secim.kod} href={secim.kod === "hepsi" ? ADRES : `${ADRES}?durum=${secim.kod}`}
              className={aktif ? "is-active" : undefined} aria-current={aktif ? "page" : undefined}>
              {secim.ad} <small>{gruplar.filter((grup) => suzgeceUyar(grup, secim.kod)).length}</small>
            </Link>
          );
        })}
        {bolumler.map((b) => (
          <Link key={b.kod} href={`${ADRES}?bolum=${b.kod}`}
            className={bolum === b.kod ? "is-active" : undefined} aria-current={bolum === b.kod ? "page" : undefined}>
            {b.ad} <small className={b.uyari ? "talep-uyari" : undefined}>{b.adet}</small>
          </Link>
        ))}
        {abonelikGorunumu ? (
          <div className="talep-ara" role="search">
            <input type="search" value={arama} placeholder="Kiracı ya da ürün ara" aria-label="Kiracı ya da ürün ara" onChange={(olay) => setArama(olay.target.value)} />
          </div>
        ) : null}
      </div>

      {!abonelikGorunumu ? children : !gruplar.length ? (
        <KBos baslik="Abonelik yok" aciklama="Aktif, denemede ya da ödemesi gecikmiş abonelik yok." />
      ) : gorunen.length ? (
        <KTablo kolonlar={[{ ad: "Kurum / ürün" }, { ad: "Paket" }, { ad: "Aylık", sinif: "crm-col-amount" }, { ad: "Dönem", sinif: "crm-col-date" }, { ad: "Durum" }, { ad: "" }]}>
          {gorunen.map((grup) => {
            const lisans = `/panel/platform/licenses?organization=${grup.organizationId}`;
            const ozet = [
              `${grup.kalemler.length} abonelik`,
              grup.denemede ? `${grup.denemede} denemede` : null,
              grup.geciken ? `${grup.geciken} gecikmiş` : null,
              grup.kapali ? `${grup.kapali} askıda/iptal` : null,
            ];
            return [
              <tr key={grup.organizationId}>
                <KBaslik avatar etiket="Kurum" href={lisans} baslik={grup.ad} alt={ozet.filter(Boolean).join(" · ")} />
                <td data-label="Paket" />
                {/* Aylık toplam kurum satırında: "bu kurum bize ne ödüyor"
                    sorusunun yanıtı satırları gözle toplamak olmamalı.
                    Denemedekiler toplama girmiyor — henüz ödemiyorlar. */}
                <td data-label="Aylık" className="crm-col-amount">
                  <b>{grup.aylikToplamAdi}</b>
                  <span className="crm-table-sub">{grup.aylikToplam ? "aylık toplam" : "tahsil edilen yok"}</span>
                </td>
                <td data-label="Dönem" className="crm-col-date" />
                <td data-label="Durum" />
                <KSatirSonu mobil={{
                  href: lisans,
                  baslik: grup.ad,
                  durum: { etiket: grup.aylikToplam ? `${grup.aylikToplamAdi} / ay` : "Tahsilat yok", ton: grup.aylikToplam ? "success" : "neutral" },
                  alt: ozet,
                }} />
              </tr>,
              ...grup.kalemler.map((kalem) => (
                <tr key={`${grup.organizationId}-${kalem.urun}`}>
                  <KBaslik etiket="Ürün" href={lisans} baslik={kalem.urunAdi} alt={grup.ad} />
                  <td data-label="Paket">{kalem.planAdi ?? "paket belirtilmedi"}</td>
                  {/* Ücreti girilmemiş abonelik ₺0 yazmıyor: sıfır ücret
                      bir fiyat, eksik ücret eksik bir kayıt. */}
                  <td data-label="Aylık" className={`crm-col-amount${kalem.ucret ? "" : " talep-uyari"}`}>{kalem.ucret ?? "ücret girilmedi"}</td>
                  <td data-label={kalem.donemNotu} className="crm-col-date">
                    {kalem.donemAdi}
                    <span className="crm-table-sub">{kalem.donemNotu}</span>
                  </td>
                  <KDurum etiket={kalem.durumAdi} ton={kalem.tone} />
                  <KSatirSonu mobil={{
                    href: lisans,
                    baslik: kalem.urunAdi,
                    durum: { etiket: kalem.durumAdi, ton: kalem.tone },
                    alt: [grup.ad, kalem.planAdi ?? "paket belirtilmedi"],
                    isaretler: [
                      { metin: kalem.ucret ?? "ücret girilmedi", ton: kalem.ucret ? "guclu" : "uyari" },
                      { metin: `${kalem.donemNotu} ${kalem.donemAdi}`, ton: "sessiz" },
                    ],
                  }} />
                </tr>
              )),
            ];
          })}
        </KTablo>
      ) : (
        <KBos baslik="Eşleşen abonelik yok" aciklama="Bu süzgeçle ya da aramayla eşleşen abonelik yok." />
      )}
    </>
  );
}
