"use client";

import Link from "next/link";
import { useTransition } from "react";
import { modulErisimiDegistir, modulKoprusuDegistir } from "./modul-actions";

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
}: {
  organizationId: string;
  kurumAdi: string;
  satirlar: ModulSatiri[];
}) {
  const [calisiyor, basla] = useTransition();

  const erisim = (satir: ModulSatiri, acilacak: boolean) => {
    let sebep = "";
    if (!acilacak) {
      /*
        Sebep burada isteniyor, sunucuda da zorunlu. Sebepsiz bir
        dondurmayı üç ay sonra kimse açıklayamıyor; müşteri arayınca
        "neden kapalı" sorusunun yanıtı kayıtta olmalı.
      */
      sebep = window.prompt(`${satir.name} neden donduruluyor?\n\n${kurumAdi} için bu sebep kayda geçer.`) ?? "";
      if (!sebep.trim()) return;
    } else if (!window.confirm(`${kurumAdi} için ${satir.name} açılsın mı?`)) {
      return;
    }

    basla(async () => {
      const veri = new FormData();
      veri.set("organization_id", organizationId);
      veri.set("product", satir.product);
      veri.set("status", acilacak ? "active" : "suspended");
      veri.set("reason", sebep);
      await modulErisimiDegistir(veri);
    });
  };

  const kopru = (satir: ModulSatiri) => {
    const entegre = !satir.integrated;
    if (!window.confirm(entegre
      ? `${satir.name} ArvoOS ile entegre çalışsın mı? Sözleşme onaylandığında otomatik kayıt oluşur.`
      : `${satir.name} bağımsız çalışsın mı? Kiracı ürünü kullanmaya devam eder, yalnızca otomatik veri akışı durur.`)) return;

    basla(async () => {
      const veri = new FormData();
      veri.set("organization_id", organizationId);
      veri.set("product", satir.product);
      veri.set("integrated", entegre ? "1" : "0");
      await modulKoprusuDegistir(veri);
    });
  };

  return (
    <div className="plt-modul-izgara">
      {satirlar.map((satir) => {
        const acik = ["active", "trialing", "past_due"].includes(satir.status);
        return (
          <article key={satir.product} className="plt-modul-kart" data-kapali={!acik}>
            <header>
              <span>
                <b>{satir.name}</b>
                <small>{satir.cekirdek ? "çekirdek" : satir.product}</small>
              </span>
              <span className="status-pill" data-tone={DURUM_TONU[satir.status] ?? "neutral"}>
                {DURUM_ADI[satir.status] ?? satir.status}
              </span>
            </header>

            <dl className="plt-modul-anahtarlar">
              <div>
                <dt>Erişim</dt>
                <dd>
                  {satir.cekirdek ? (
                    /* Çekirdek lisans ayrı tabloda ve dondurulduğunda kurumun
                       tamamı kapanıyor; o karar lisans ekranında veriliyor. */
                    <Link className="modul-baglanti" href={`/panel/platform/licenses?organization=${organizationId}`}>Lisans ekranı →</Link>
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
                </dd>
              </div>

              {/* Köprü yalnızca erişim açıkken anlamlı: kapalı bir kapının
                  kilidini göstermenin anlamı yok. */}
              {satir.cekirdek ? null : (
                <div>
                  <dt>Köprü</dt>
                  <dd>
                    {acik ? (
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
                  </dd>
                </div>
              )}
            </dl>

            <footer>
              <b>{satir.monthlyFee ? `${tl(Number(satir.monthlyFee))} / ay` : "ücret girilmedi"}</b>
              {satir.kotaOzeti ? <small>{satir.kotaOzeti}</small> : null}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
