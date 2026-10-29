"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LisansFormu, type LisansDegerleri } from "./lisans-formu";
import { UrunFormu, type KotaAlani } from "./urun-formu";
import { MobilSatir } from "../../crm/table-cells";
import { OnayPenceresi, type OnayIstegi } from "../../components/onay-penceresi";
import { urunSimgesi } from "@/lib/products";

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
      /** Kurumun panel erişimi açık mı (lisans 'suspended' değil). */
      erisimAcik: boolean;
      baslangic: LisansDegerleri;
      aktifUye: number;
      kullanilanMb: number;
      aiKullanilan: number | null;
    })
  | (OrtakKart & {
      tur: "ek";
      /** Ürün kullanılıyorsa (lisans satırı inactive değil) erişim açık mı; kullanılmıyorsa null — anahtar yok. */
      erisimAcik: boolean | null;
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
  erisimiDegistir,
  urunErisiminiDegistir,
}: {
  organizationId: string;
  kurumAdi: string;
  kartlar: UrunKarti[];
  /** ArvoOS erişimini kapat / aç (licenses/actions cekirdekErisimi). */
  erisimiDegistir: (formData: FormData) => Promise<unknown> | void;
  /** Ek ürün erişimini kapat / aç (modul-actions modulErisimiDegistir). */
  urunErisiminiDegistir: (formData: FormData) => Promise<unknown> | void;
  cekirdegiKaydet: (formData: FormData) => void;
  urunuKaydet: (formData: FormData) => void;
  urunuYansit: (formData: FormData) => void;
}) {
  const [acik, setAcik] = useState<string | null>(null);
  const [calisiyor, basla] = useTransition();

  /* Kapatma geri alınabilir ama müşteriyi anında dışarıda bırakıyor:
     yanlış satıra dokunmaya karşı onay soruluyor (üye erişimindeki gibi).

     Onay panelin kendi penceresinde (../onay-penceresi): tarayıcının
     confirm/prompt kutuları susturulabiliyor ve susturulduğunda anahtara
     basmak sessizce hiçbir şey yapmıyordu. Gerekçe o dosyanın başında.

     Kapatırken SEBEP soruluyor (modül matrisindeki kuralın aynısı):
     sebepsiz bir dondurmayı üç ay sonra kimse açıklayamıyor; müşteri
     arayınca "neden kapalı" sorusunun yanıtı kayıtta olmalı. Hazır metin
     en sık sebep; kurucu değiştirebilir. */
  const [onay, setOnay] = useState<{ istek: OnayIstegi; uygula: (sebep: string) => void } | null>(null);

  const erisimDegistir = (kart: UrunKarti, acilacak: boolean) => {
    const cekirdek = kart.tur === "cekirdek";
    const uygula = (sebep: string) => basla(async () => {
      const veri = new FormData();
      veri.set("organization_id", organizationId);
      if (cekirdek) {
        veri.set("ac", acilacak ? "true" : "false");
        veri.set("reason", sebep);
        await erisimiDegistir(veri);
      } else {
        veri.set("product", kart.kod);
        veri.set("status", acilacak ? "active" : "suspended");
        veri.set("reason", sebep);
        await urunErisiminiDegistir(veri);
      }
      setOnay(null);
    });

    setOnay({
      uygula,
      istek: acilacak
        ? {
            ust: kurumAdi,
            baslik: `${kart.ad} erişimi açılsın mı?`,
            metin: cekirdek
              ? `${kurumAdi} paneli yeniden kullanabilir.`
              : `${kurumAdi} kullanıcıları ${kart.ad}'a yeniden girebilir.`,
            onayEtiketi: "Aç",
          }
        : {
            ust: kurumAdi,
            baslik: `${kart.ad} erişimi kapatılsın mı?`,
            metin: cekirdek
              ? `${kurumAdi} içindeki herkes paneli kullanamaz; yalnızca kurum sahibi ödeme ekranına ulaşır. Verileri silinmez, erişim istendiğinde yeniden açılır.`
              : `${kurumAdi} kullanıcıları ${kart.ad}'a giremez. Verileri silinmez, erişim istendiğinde yeniden açılır.`,
            onayEtiketi: "Kapat",
            tehlike: true,
            sebep: {
              etiket: "Kapatma sebebi",
              varsayilan: "Abonelik ödemesi alınamadı.",
              ipucu: cekirdek
                ? "Kayda geçer ve kuruma kilit ekranında gösterilir."
                : "Kayda geçer; müşteri sorduğunda yanıtın kayıtta olması gerekiyor.",
            },
          },
    });
  };
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
        PANELİN TABLOSU (29.10.2026, müşteri kartı sekmeleri). 14.10.2026'dan
        beri iOS satırıydı: paket, dönem ve kota tek alt satırda virgülle
        diziliyor, anahtarın yeri hizalansın diye kapalı ürünlerde boş bir
        kutu çiziliyordu. Artık sütunlar: ürün, ayrıntı, durum, aylık,
        erişim, düzenle. Düzenleme yine pencerede.
      */}
      <div className="talep-tablo fn-ic-tablo">
        <table className="crm-data-table" data-cols="mk-urun">
          <thead><tr><th>Ürün</th><th>Ayrıntı</th><th>Durum</th><th className="crm-col-amount">Aylık</th><th>Erişim</th><th></th></tr></thead>
          <tbody>
            {kartlar.map((kart) => {
              const ucret = kart.ozet.find((satir) => satir.etiket === "Aylık ücret")?.deger ?? "";
              const ozet = kart.ozet.filter((satir) => satir.etiket !== "Aylık ücret");
              const durum = { etiket: kart.durumAdi, ton: kart.acik ? kart.tone : "neutral" };
              const ucretVar = Boolean(ucret && ucret !== "girilmedi");
              return (
                <tr key={kart.kod} className={kart.acik ? undefined : "is-pasif"}>
                  <td data-label="Ürün">
                    <span className="ek-kisi">
                      {/* Dört ürünün adı da "Arvo" ile başlıyor: baş harf yerine ürünün kısa kodu. */}
                      <span className="ek-avatar" aria-hidden="true">{urunSimgesi(kart.kod) ?? kart.ad.slice(0, 2)}</span>
                      <span className="ek-kisi-metin"><span className="crm-table-title">{kart.ad}</span><span className="crm-table-sub" title={kart.aciklama}>{kart.aciklama}</span></span>
                    </span>
                  </td>
                  <td data-label="Ayrıntı">
                    {ozet.length ? ozet.map((satir) => (
                      <span key={satir.etiket} className="crm-table-sub mk-ozet"><b>{satir.etiket}</b> {satir.deger}</span>
                    )) : <span className="crm-table-sub">—</span>}
                  </td>
                  <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                  {/* Kapalı üründe ücret beklenmiyor: uyarı rengi yalnızca açık üründe. */}
                  <td className="crm-col-amount" data-label="Aylık">
                    {ucretVar ? <span className="crm-table-title">{ucret.replace(" / ay", "")}</span> : kart.acik ? <span className="k-ios-eksik">Ücret yok</span> : <span className="crm-table-sub">—</span>}
                  </td>
                  <td data-label="Erişim">
                    {/* ERİŞİM ANAHTARI (14.10.2026): ödeme yapmayan kurumu tek
                        dokunuşla kapatmak için. Kullanmadığı üründe anahtar yok
                        (ürün açmak lisans formunda). */}
                    {kart.erisimAcik !== null ? (
                      <button
                        type="button"
                        className={kart.erisimAcik ? "plt-switch is-on" : "plt-switch is-off"}
                        role="switch"
                        aria-checked={kart.erisimAcik}
                        aria-label={`${kurumAdi} ${kart.ad} erişimi: ${kart.erisimAcik ? "kapat" : "aç"}`}
                        title={kart.erisimAcik ? "Erişimi kapat" : "Erişimi aç"}
                        disabled={calisiyor}
                        onClick={() => erisimDegistir(kart, !kart.erisimAcik)}
                      ><i /></button>
                    ) : <span className="crm-table-sub">kullanmıyor</span>}
                  </td>
                  <td className="crm-table-actions">
                    <button type="button" className="panel-secondary" onClick={() => setAcik(kart.kod)} aria-label={`${kart.ad} aboneliğini düzenle`}>
                      Düzenle
                    </button>
                  </td>
                  <MobilSatir baslik={kart.ad} durum={durum}
                    alt={[ucretVar ? ucret : null, ...ozet.map((satir) => `${satir.etiket} ${satir.deger}`)]} />
                </tr>
              );
            })}
          </tbody>
        </table>
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
                yenidenYansit={urunuYansit}
                yansima={secili.yansima}
              />
            )}
          </div>
        ) : null}
      </dialog>

      <OnayPenceresi
        istek={onay?.istek ?? null}
        calisiyor={calisiyor}
        onIptal={() => { if (!calisiyor) setOnay(null); }}
        onOnay={(sebep) => onay?.uygula(sebep)}
      />
    </>
  );
}
