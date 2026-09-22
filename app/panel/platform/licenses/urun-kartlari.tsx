"use client";

import { useEffect, useRef, useState } from "react";
import { LisansFormu, type LisansDegerleri } from "./lisans-formu";
import { UrunFormu, type KotaAlani } from "./urun-formu";

/*
  Dört ürün, tek satırda dört kart.

  Eskiden ArvoOS çekirdek lisansı tam genişlikte dev bir form, diğer üç
  ürün ise altında ayrı bir bölümdeydi. Oysa dördü de ayrı ürün: ArvoOS,
  ArvoLab, Arc, Randevu. Sayfa ikiye bölününce "bu kiracı hangi ürünleri
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
    });

export function UrunKartlari({
  organizationId,
  kurumAdi,
  kartlar,
  cekirdegiKaydet,
  urunuKaydet,
}: {
  organizationId: string;
  kurumAdi: string;
  kartlar: UrunKarti[];
  cekirdegiKaydet: (formData: FormData) => void;
  urunuKaydet: (formData: FormData) => void;
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
      <div className="plt-urun-izgara">
        {kartlar.map((kart) => (
          <button
            key={kart.kod}
            type="button"
            className="plt-urun-karti"
            data-kapali={!kart.acik}
            onClick={() => setAcik(kart.kod)}
          >
            <span className="plt-urun-bas">
              <b>{kart.ad}</b>
              <span className="status-pill" data-tone={kart.tone}>{kart.durumAdi}</span>
            </span>
            <small className="plt-urun-aciklama">{kart.aciklama}</small>
            <dl className="plt-urun-ozet">
              {kart.ozet.map((satir) => (
                <div key={satir.etiket}>
                  <dt>{satir.etiket}</dt>
                  <dd>{satir.deger}</dd>
                </div>
              ))}
            </dl>
            <span className="plt-urun-duzenle">Düzenle →</span>
          </button>
        ))}
      </div>

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
              />
            )}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
