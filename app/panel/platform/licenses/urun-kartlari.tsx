"use client";

import { useEffect, useRef, useState } from "react";
import { LisansFormu, type LisansDegerleri } from "./lisans-formu";
import { UrunFormu, type KotaAlani } from "./urun-formu";
import { KListe, KOge } from "../konsol-ui";

/*
  Dört ürün, tek satırda dört kart.

  Eskiden ArvoOS çekirdek lisansı tam genişlikte dev bir form, diğer üç
  ürün ise altında ayrı bir bölümdeydi. Oysa dördü de ayrı ürün: ArvoOS,
  ArvoLab, ArvoARC, Randevu. Sayfa ikiye bölününce "bu kiracı hangi ürünleri
  alıyor" sorusunu yanıtlamak için iki ayrı yere bakmak gerekiyordu ve
  çekirdek form dokuz alanıyla ekranın yarısını yiyordu.

  Kartlar artık YALNIZCA ÖZET: durum, paket, ücret, dönem, kota. Düzenleme
  karta tıklayınca açılan pencerede. Dört formu aynı anda açık tutmak,
  hepsini okunmaz dar sütunlara sıkıştırmak demekti; özet dar sütunda da
  okunuyor, form ise açıldığı pencerede geniş.

  Pencere <dialog>: odak tuzağı, Esc ile kapanma ve arka planın
  erişilemez olması tarayıcıdan geliyor. Elle yazılan bir katmanda bunların
  üçü de kaçırılır.
*/

type Ozet = { etiket: string; deger: string };

type OrtakKart = {
  kod: string;
  ad: string;
  aciklama: string;
  durumAdi: string;
  tone: string;
  /** Kart sönük çiziliyor: kapalı ürün, açık üründen ayırt edilebilmeli. */
  acik: boolean;
  ozet: Ozet[];
};

export type UrunKarti =
  | (OrtakKart & {
      tur: "cekirdek";
      baslangic: LisansDegerleri;
      aktifUye: number;
      kullanilanMb: number;
      aiKullanilan: number | null;
    })
  | (OrtakKart & {
      tur: "ek";
      baslangic: { status: string; planCode: string; monthlyFee: string; currentPeriodEnd: string; suspensionReason: string };
      kotalar: KotaAlani[];
      yansima: { uyari: boolean; notu: string };
    });

export function UrunKartlari({
  organizationId,
  kurumAdi,
  kartlar,
  cekirdegiKaydet,
  urunuKaydet,
  urunuYansit,
}: {
  organizationId: string;
  kurumAdi: string;
  kartlar: UrunKarti[];
  cekirdegiKaydet: (formData: FormData) => void;
  urunuKaydet: (formData: FormData) => void;
  urunuYansit: (formData: FormData) => void;
}) {
  const [acik, setAcik] = useState<string | null>(null);
  const pencere = useRef<HTMLDialogElement>(null);

  /*
    showModal() elle çağrılıyor: <dialog open> ile çizmek pencereyi kipsiz
    yapıyor, yani arka plan tıklanabilir kalıyor ve Esc çalışmıyor.
  */
  useEffect(() => {
    const oge = pencere.current;
    if (!oge) return;
    if (acik && !oge.open) oge.showModal();
    if (!acik && oge.open) oge.close();
  }, [acik]);

  const secili = kartlar.find((kart) => kart.kod === acik) ?? null;

  return (
    <>
      {/*
        KOMPAKT LİSTE (14.10.2026). Dört ürün dört kartlık bir ızgaraydı:
        her kartta açıklama cümlesi ve beş satırlık özet, pencerede ekranın
        yarısı. Artık tek satır — ürün, özet (paket · dönem · kota), durum,
        aylık ücret ve Düzenle. Özetin içeriği aynı; yalnızca dizilişi.
      */}
      <KListe>
        {kartlar.map((kart) => {
          const ucret = kart.ozet.find((satir) => satir.etiket === "Aylık ücret")?.deger ?? "";
          const ozet = kart.ozet
            .filter((satir) => satir.etiket !== "Aylık ücret")
            .map((satir) => `${satir.etiket} ${satir.deger}`)
            .join(" · ");
          return (
            <KOge
              key={kart.kod}
              simge={kart.ad}
              baslik={kart.ad}
              alt={ozet}
              durum={{ etiket: kart.durumAdi, ton: kart.acik ? kart.tone : "neutral" }}
              /* Kapalı üründe ücret beklenmiyor: uyarı rengi yalnızca açık üründe. */
              deger={ucret && ucret !== "girilmedi" ? ucret.replace(" / ay", "") : kart.acik ? <span className="k-ios-eksik">Ücret yok</span> : "—"}
              degerAlt={ucret && ucret !== "girilmedi" ? "aylık" : undefined}
              sonu={(
                <button type="button" className="panel-secondary" onClick={() => setAcik(kart.kod)} aria-label={`${kart.ad} aboneliğini düzenle`}>
                  Düzenle
                </button>
              )}
            />
          );
        })}
      </KListe>

      <dialog
        ref={pencere}
        className="plt-pencere"
        aria-label={secili ? `${secili.ad} aboneliği` : "Ürün"}
        /* Esc ve arka plan tıklaması tarayıcıdan geliyor; durumu da
           kapatmazsak pencere kapanıyor ama React hâlâ açık sanıyor. */
        onClose={() => setAcik(null)}
        onClick={(olay) => { if (olay.target === pencere.current) setAcik(null); }}
      >
        {secili ? (
          <div className="plt-pencere-govde">
            <header className="plt-pencere-bas">
              <div>
                <small>{kurumAdi}</small>
                <h2>{secili.ad} aboneliği</h2>
              </div>
              <button type="button" className="plt-pencere-kapat" aria-label="Kapat" onClick={() => setAcik(null)}>×</button>
            </header>

            {secili.tur === "cekirdek" ? (
              <LisansFormu
                organizationId={organizationId}
                baslangic={secili.baslangic}
                aktifUye={secili.aktifUye}
                kullanilanMb={secili.kullanilanMb}
                aiKullanilan={secili.aiKullanilan}
                kaydet={cekirdegiKaydet}
              />
            ) : (
              <UrunFormu
                organizationId={organizationId}
                product={secili.kod}
                productName={secili.ad}
                baslangic={secili.baslangic}
                kotalar={secili.kotalar}
                kaydet={urunuKaydet}
                yenidenYansit={urunuYansit}
                yansima={secili.yansima}
              />
            )}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
