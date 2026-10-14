"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { KBos, KListe, KOge } from "../konsol-ui";

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

  iOS LİSTESİ (14.10.2026, "iOS gibi olmalı"): kurum satırı + altında
  ürün satırları olan tablo yerine HER KURUM TEK SATIR — simge, ad,
  altında ürünler ve paketleri tek satırda; sağda kurumun durumu ve
  aylık toplamı. Ürün satırları ayrı çizildiğinde kurum adı her satırda
  tekrar ediyordu ve sütun başlıklarıyla liste iki kat uzuyordu. Ürünün
  dönem tarihi lisans ekranında (satırın bağlantısı), yaklaşan dönem
  sonları "Dönem sonu yaklaşanlar" bölümünde.

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
  /** Grup markası: tutarı müşteri geliri değil, grup içi değer. */
  grup?: boolean;
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

/** Kurum satırının durumu için öncelik: önce peşine düşülecek olan. */
const DURUM_ONCELIGI = ["past_due", "active", "trialing", "suspended", "canceled"];

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
        <KListe>
          {gorunen.map((grup) => {
            const lisans = `/panel/platform/musteriler/${grup.organizationId}?pencere=lisanslar`;
            /* Kurumun durumu, ürünlerinden en çok dikkat isteyeninki:
               gecikmiş ödeme aktif aboneliği, aktif olan denemeyi örter.
               Ondan farklı durumdaki ürün özette parantezle yazılıyor. */
            const ana = DURUM_ONCELIGI.map((kod) => grup.kalemler.find((kalem) => kalem.durum === kod)).find(Boolean) ?? grup.kalemler[0];
            const urunler = grup.kalemler.map((kalem) =>
              `${kalem.urunAdi}${kalem.planAdi ? ` ${kalem.planAdi}` : ""}${ana && kalem.durum !== ana.durum ? ` (${kalem.durumAdi.toLocaleLowerCase("tr-TR")})` : ""}`);
            /* Ücreti girilmemiş abonelik ₺0 yazmıyor: sıfır ücret bir
               fiyat, eksik ücret eksik bir kayıt. */
            const ucretsiz = grup.kalemler.filter((kalem) => !kalem.ucret).length;
            return (
              <KOge
                key={grup.organizationId}
                href={lisans}
                simge={grup.ad}
                baslik={grup.ad}
                alt={[grup.grup ? "Grup markası" : null, ...urunler, ucretsiz ? `${ucretsiz} üründe ücret girilmedi` : null].filter(Boolean).join(" · ")}
                durum={ana ? { etiket: ana.durumAdi, ton: ana.tone } : null}
                /* Aylık toplam kurum satırında: "bu kurum bize ne ödüyor"
                   sorusunun yanıtı satırları gözle toplamak olmamalı.
                   Denemedekiler toplama girmiyor — henüz ödemiyorlar. */
                deger={grup.aylikToplamAdi}
                degerAlt={grup.aylikToplam ? (grup.grup ? "grup içi değer" : "aylık toplam") : "tahsil edilen yok"}
              />
            );
          })}
        </KListe>
      ) : (
        <KBos baslik="Eşleşen abonelik yok" aciklama="Bu süzgeçle ya da aramayla eşleşen abonelik yok." />
      )}
    </>
  );
}
