"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { modulErisimiDegistir, modulKoprusuDegistir } from "./modul-actions";
import { KBaslik, KDurum, KListe, KOge, KTablo } from "./konsol-ui";
import { OnayPenceresi, type OnayIstegi } from "../components/onay-penceresi";
// Anahtar (.plt-switch) ve bağlantı (.modul-baglanti) konsolun stilinde.
import "./platform.css";

/*
  Modül kartları: dört ürün yan yana, kart başına iki anahtar.

  Kurucunun en sık yaptığı iş bu ve bugüne kadar üç ayrı yere dağılmıştı:
  erişim lisans formunun içinde bir açılır liste, köprü hiçbir yerde,
  ücret başka bir sayfada. Kiracıyı dondurmak için formu bulup kaydetmek
  gerekiyordu.

  Anahtar, düğmeden iyi: "Dondur" yazan bir düğme şu anki durumu değil
  yapılacak işi söylüyordu, yani durumu okumak için yanındaki rozete
  bakmak gerekiyordu. Anahtar ikisini birden gösteriyor — sağdaysa açık
  (yeşil), soldaysa kapalı (kırmızı).

  İKİ ANAHTAR AYRI DURUYOR, çünkü ayrı şeyler:

    Erişim — kiracı ürüne girebiliyor mu. Tahsilat aracı.
    Köprü  — ArvoOS ile otomatik veri akışı var mı. Ürün tercihi.

  Tek anahtara bindirilirse "ödemesini yapmış ama bağımsız çalışmak
  isteyen" kiracıya verilecek cevap kalmıyor.
*/

export type ModulSatiri = {
  product: string;
  name: string;
  /** organization_licenses (ArvoOS) ya da organization_product_licenses. */
  status: string;
  /** ArvoOS çekirdeğinde köprü kavramı yok; kendisiyle senkronlanmaz. */
  integrated: boolean | null;
  monthlyFee: number | null;
  /** "250 kullanıcı · 500 GB" gibi; ölçümü olmayan limit yazılmaz. */
  kotaOzeti: string | null;
  /** Çekirdek lisans ayrı tabloda; anahtarları burada çizmiyoruz. */
  cekirdek: boolean;
};

const DURUM_ADI: Record<string, string> = {
  active: "Aktif", trialing: "Deneme", past_due: "Ödeme gecikmiş",
  suspended: "Donduruldu", inactive: "Kapalı", canceled: "İptal",
};

const DURUM_TONU: Record<string, string> = {
  active: "success", trialing: "info", past_due: "warning",
  suspended: "danger", inactive: "neutral", canceled: "danger",
};

const tl = (kurus: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(kurus / 100);

export function ModulMatrisi({
  organizationId,
  kurumAdi,
  satirlar,
  yalnizKopru = false,
}: {
  organizationId: string;
  kurumAdi: string;
  satirlar: ModulSatiri[];
  /*
    Müşteri detayının Kurum Ayarları penceresinde (14.10.2026): erişim
    anahtarı ve ücret orada Lisanslar penceresinde; aynı anahtarı iki
    pencerede göstermek "hangisi geçerli" sorusunu doğuruyordu. Yalnızca
    açık ek ürünlerin köprüsü kalıyor.
  */
  yalnizKopru?: boolean;
}) {
  const [calisiyor, basla] = useTransition();
  /*
    Onay artık panelin kendi penceresinde (onay-penceresi.tsx): tarayıcı
    kutuları susturulabiliyor ve susturulunca anahtara basmak sessizce
    hiçbir şey yapmıyordu. Gerekçe o dosyanın başında.
  */
  const [onay, setOnay] = useState<{ istek: OnayIstegi; uygula: (sebep: string) => void } | null>(null);

  const gonder = (alanlar: Record<string, string>, eylem: (veri: FormData) => Promise<unknown> | void) =>
    basla(async () => {
      const veri = new FormData();
      veri.set("organization_id", organizationId);
      for (const [ad, deger] of Object.entries(alanlar)) veri.set(ad, deger);
      await eylem(veri);
      setOnay(null);
    });

  const erisim = (satir: ModulSatiri, acilacak: boolean) => setOnay({
    istek: acilacak
      ? {
          ust: kurumAdi,
          baslik: `${satir.name} açılsın mı?`,
          metin: `${kurumAdi} kullanıcıları ${satir.name}'a yeniden girebilir.`,
          onayEtiketi: "Aç",
        }
      : {
          ust: kurumAdi,
          baslik: `${satir.name} dondurulsun mu?`,
          metin: `${kurumAdi} kullanıcıları ${satir.name}'a giremez. Verileri silinmez, erişim istendiğinde yeniden açılır.`,
          onayEtiketi: "Dondur",
          tehlike: true,
          /*
            Sebep burada isteniyor, sunucuda da zorunlu. Sebepsiz bir
            dondurmayı üç ay sonra kimse açıklayamıyor; müşteri arayınca
            "neden kapalı" sorusunun yanıtı kayıtta olmalı.
          */
          sebep: { etiket: "Dondurma sebebi", ipucu: "Kayda geçer; müşteri sorduğunda yanıtın kayıtta olması gerekiyor." },
        },
    uygula: (sebep) => gonder(
      { product: satir.product, status: acilacak ? "active" : "suspended", reason: sebep },
      modulErisimiDegistir,
    ),
  });

  const kopru = (satir: ModulSatiri) => {
    const entegre = !satir.integrated;
    setOnay({
      istek: {
        ust: kurumAdi,
        baslik: entegre ? `${satir.name} entegre çalışsın mı?` : `${satir.name} bağımsız çalışsın mı?`,
        metin: entegre
          ? "Sözleşme onaylandığında ürün kaydı otomatik oluşur."
          : "Kiracı ürünü kullanmaya devam eder, yalnızca otomatik veri akışı durur.",
        onayEtiketi: entegre ? "Entegre et" : "Bağımsıza al",
      },
      uygula: () => gonder({ product: satir.product, integrated: entegre ? "1" : "0" }, modulKoprusuDegistir),
    });
  };

  /*
    14.10.2026: kart ızgarası (.plt-modul-kart) yerine panelin tablosu
    (konsol-ui): ürün başına bir satır, anahtarlar hücrede. Telefonda
    tek kompakt satır (MobilSatir) KULLANILMIYOR: o görünüm öbür hücreleri
    gizliyor ve anahtarlar telefonda erişilemez kalırdı; tablo telefonda
    etiketli hücrelere açılıyor.

    Konsolun öbür listeleri iOS satırına geçti (KListe/KOge, 14.10.2026);
    bu tablo BİLEREK kalıyor: satır başına iki anahtar (erişim, köprü)
    ayrı sütunlarda alt alta hizalı okunuyor, KOge'nin tek "sonu"
    yuvasına iki anahtar etiketsiz sığınca hangisinin hangisi olduğu
    belirsizleşiyor.
  */
  /* Pencere iki dönüş yolunda da çizilmeli: yalnız-köprü listesi de
     anahtarı olan bir görünüm. */
  const pencere = (
    <OnayPenceresi
      istek={onay?.istek ?? null}
      calisiyor={calisiyor}
      onIptal={() => { if (!calisiyor) setOnay(null); }}
      onOnay={(sebep) => onay?.uygula(sebep)}
    />
  );

  if (yalnizKopru) {
    const acikEkler = satirlar.filter((satir) => !satir.cekirdek && ["active", "trialing", "past_due"].includes(satir.status));
    return (
      <>
      <KListe>
        {acikEkler.map((satir) => (
          <KOge
            key={satir.product}
            baslik={satir.name}
            alt={satir.integrated ? "Entegre: sözleşme onayında otomatik kayıt" : "Bağımsız: otomatik veri akışı yok"}
            sonu={(
              <button
                type="button"
                className={satir.integrated ? "plt-switch is-on" : "plt-switch"}
                role="switch"
                aria-checked={Boolean(satir.integrated)}
                aria-label={`${satir.name} köprüsü: ${satir.integrated ? "bağımsıza al" : "entegre et"}`}
                disabled={calisiyor}
                onClick={() => kopru(satir)}
              ><i /></button>
            )}
          />
        ))}
      </KListe>
      {pencere}
      </>
    );
  }

  return (
    <>
    <KTablo kolonlar={[{ ad: "Modül" }, { ad: "Durum" }, { ad: "Erişim" }, { ad: "Köprü" }, { ad: "Aylık ücret", sinif: "crm-col-amount" }]}>
      {satirlar.map((satir) => {
        const acik = ["active", "trialing", "past_due"].includes(satir.status);
        return (
          <tr key={satir.product} className={acik ? undefined : "is-pasif"}>
            <KBaslik etiket="Modül" baslik={satir.name} alt={satir.cekirdek ? "çekirdek" : satir.product} />
            <KDurum etiket={DURUM_ADI[satir.status] ?? satir.status} ton={DURUM_TONU[satir.status] ?? "neutral"} />
            <td data-label="Erişim">
              {satir.cekirdek ? (
                /* Çekirdek lisans ayrı tabloda ve dondurulduğunda kurumun
                   tamamı kapanıyor; o karar lisans ekranında veriliyor. */
                <Link className="modul-baglanti" href={`/panel/platform/musteriler/${organizationId}?pencere=lisanslar`}>Lisans ekranı →</Link>
              ) : (
                <button
                  type="button"
                  className={acik ? "plt-switch is-on" : "plt-switch is-off"}
                  role="switch"
                  aria-checked={acik}
                  aria-label={`${satir.name} erişimi: ${acik ? "kapat" : "aç"}`}
                  disabled={calisiyor}
                  onClick={() => erisim(satir, !acik)}
                ><i /></button>
              )}
            </td>

            {/* Köprü yalnızca erişim açıkken anlamlı: kapalı bir kapının
                kilidini göstermenin anlamı yok. */}
            <td data-label="Köprü">
              {satir.cekirdek ? <span className="modul-bos">—</span> : acik ? (
                <button
                  type="button"
                  className={satir.integrated ? "plt-switch is-on" : "plt-switch"}
                  role="switch"
                  aria-checked={Boolean(satir.integrated)}
                  aria-label={`${satir.name} köprüsü: ${satir.integrated ? "bağımsıza al" : "entegre et"}`}
                  disabled={calisiyor}
                  onClick={() => kopru(satir)}
                ><i /></button>
              ) : <span className="modul-bos">—</span>}
            </td>

            <td data-label="Aylık ücret" className="crm-col-amount">
              {satir.monthlyFee ? `${tl(Number(satir.monthlyFee))} / ay` : <span className="talep-uyari">ücret girilmedi</span>}
              {satir.kotaOzeti ? <span className="crm-table-sub">{satir.kotaOzeti}</span> : null}
            </td>
          </tr>
        );
      })}
    </KTablo>
    {pencere}
    </>
  );
}
