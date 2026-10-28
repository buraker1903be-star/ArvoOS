"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { PRODUCT_APPS, ROUTES, type Locale } from "@/lib/site/routes";
import { CHROME } from "../_content/chrome";
import { ProductLogo, type ProductName } from "./marks";

/*
  GİRİŞ PENCERESİ (28.10.2026, kurum sahibinin isteği). Üst bardaki
  "Giriş" eskiden açılır menüydü: üç satır, ad ve alan adı. Artık ortada
  bir pencere: üç ürün yan yana, logosu, ne işe yaradığı, "Talep et" ve
  "Giriş yap". Hesabı olmayan ziyaretçi de buradan yolunu buluyor.

  Yerleşik <dialog> + showModal(): odak pencerede kalıyor, Esc kapatıyor,
  arka plan tıklanamıyor. Pencere ÜST KATMANDA çiziliyor — bulanık
  (backdrop-filter) başlığın içindeki position:fixed çocuk ekrana göre
  konumlanmıyor (AGENTS.md, mobil menü 13.10.2026), top layer bu kuralın
  dışında.
*/
const URUNLER = ["arvoos", "arvolab", "randevu"] as const;

export function GirisPenceresi({ locale, acik, kapat }: { locale: Locale; acik: boolean; kapat: () => void }) {
  const t = CHROME[locale].signInPanel;
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (acik && !d.open) d.showModal();
    if (!acik && d.open) d.close();
  }, [acik]);

  // İlgi parametresi Türkçe sayfada eski adıyla (ilgi), ötekilerde interest.
  const talep = (urun: string) => `${ROUTES.contact[locale]}${locale === "tr" ? "?ilgi=" : "?interest="}${urun}`;

  return (
    <dialog ref={ref} className="giris-pencere" aria-labelledby="giris-baslik" onClose={kapat}
      onClick={(e) => { if (e.target === e.currentTarget) kapat(); }}>
      <div className="giris-ic">
        <div className="giris-bas">
          <div>
            <h2 id="giris-baslik">{t.title}</h2>
            <p>{t.lead}</p>
          </div>
          <button type="button" className="giris-kapat" onClick={kapat} aria-label={t.close}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="giris-kartlar">
          {URUNLER.map((urun) => {
            const app = PRODUCT_APPS[urun];
            return (
              <article key={urun} className="giris-kart">
                <ProductLogo name={app.name as ProductName} height={26} />
                <p className="giris-amac">{t.purposes[urun]}</p>
                <p className="giris-adres">{app.host}</p>
                <div className="giris-eylem">
                  <Link className="btn btn-s btn-ghost" href={talep(urun)} onClick={kapat}>{t.request}</Link>
                  <a className="btn btn-s btn-primary" href={app.url} target="_blank" rel="noopener" onClick={kapat}>{t.login}</a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
