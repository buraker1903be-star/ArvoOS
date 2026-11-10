"use client";

import Link from "next/link";
import { useRef, type CSSProperties, type ReactNode } from "react";

/*
  KURULUM: KOMPAKT ÖZET + ADIMLAR PENCEREDE (10.11.2026, FX-01/FX-02).

  Gerçek oturum kabulünde (1363×936) ölçüldü: kurulum kartı adımlarıyla
  316 px yer kaplıyor, içeriği 337 px olduğu için kart kendi içinde
  kayıyor ve kaydırınca BAŞLIĞI da kayıp kesiliyordu; aynı ekranda
  Operasyon ve Aşama listelerine 65 px kalıyordu (bir kayıt ~76 px).

  Kurulum destekleyici bir alan: ana ekranda tek satır özet — ilerleme,
  kalan zorunlu adım ve "Kuruluma devam et" (ilk eksik zorunlu adım).
  Adımların tamamı "Adımları göster" ile bir PENCEREDE açılır: başlık ve
  kapatma sabit, adım listesi pencerenin gövdesinde kayar; iş listelerini
  sıkıştırmaz. Pencere kapanınca odak düğmeye döner.

  İlerleme hesabı değişmedi (lib/kurulum-ilerlemesi.ts, OS-03): sayılar
  zorunlu adımlardan, isteğe bağlı ekip adımı pencerede ayrı bölümde.
*/
export function KurulumOzeti({ tamamlanan, toplam, yuzde, ozet, devamHref, children }: {
  tamamlanan: number;
  toplam: number;
  yuzde: number;
  /** "4 zorunlu adımdan 1 tanesi tamamlandı" */
  ozet: string;
  /** İlk tamamlanmamış zorunlu adım. */
  devamHref: string | null;
  /** Pencerede gösterilecek adım listeleri. */
  children: ReactNode;
}) {
  const pencere = useRef<HTMLDialogElement>(null);
  const dugme = useRef<HTMLButtonElement>(null);
  const kalan = toplam - tamamlanan;

  return (
    <section className="dash-card dash-kurulum" aria-label="Kurulum">
      <div className="dash-kurulum-metin">
        <h2>Kurulumu tamamlayın</h2>
        <p>{kalan} zorunlu adım kaldı · {tamamlanan}/{toplam}</p>
      </div>
      <div className="dash-setup-progress dash-kurulum-cubuk" role="progressbar" aria-valuemin={0} aria-valuemax={toplam} aria-valuenow={tamamlanan} aria-valuetext={ozet}>
        <span><i style={{ "--w": `${yuzde}%` } as CSSProperties} /></span>
      </div>
      <div className="dash-kurulum-eylem">
        {devamHref ? <Link className="panel-primary" href={devamHref}>Kuruluma devam et</Link> : null}
        <button ref={dugme} type="button" className="panel-secondary" aria-haspopup="dialog" onClick={() => pencere.current?.showModal()}>
          Adımları göster
        </button>
      </div>
      <dialog
        ref={pencere}
        className="dash-kurulum-pencere"
        aria-labelledby="dash-kurulum-baslik"
        onClose={() => dugme.current?.focus()}
        onClick={(olay) => { if (olay.target === pencere.current) pencere.current?.close(); }}
      >
        <header className="dash-kurulum-pencere-bas">
          <div>
            <h2 id="dash-kurulum-baslik">Kurulum adımları</h2>
            <p>{ozet}</p>
          </div>
          <button type="button" className="os-icon-btn" aria-label="Kapat" onClick={() => pencere.current?.close()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="dash-kurulum-pencere-govde">{children}</div>
      </dialog>
    </section>
  );
}
