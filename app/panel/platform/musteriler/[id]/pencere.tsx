"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
// Pencerenin kabuğu (.plt-pencere) konsolun stilinde.
import "../../platform.css";

/*
  Müşteri detayının açılır penceresi (14.10.2026, kurum sahibinin isteği:
  "butonların sayfası müşteri detay sayfasında açılan popup olsun").

  Pencere ADRESTE (?pencere=lisanslar): içerik sunucuda yalnızca açık
  pencere için okunuyor, kapalı beş pencerenin verisi boşuna çekilmiyor.
  Bir başka getirisi: pencerenin içindeki bir form kaydedince sayfa
  yeniden çiziliyor ve adres aynı kaldığı için pencere AÇIK kalıyor —
  istemcide tutulan bir "açık mı" durumu o yeniden çizimde kaybolurdu.

  showModal() elle çağrılıyor: <dialog open> pencereyi kipsiz yapıyor
  (arka plan tıklanabilir, Esc çalışmıyor). Kapanınca adres pencere
  parametresi olmadan değişiyor.
*/
export function MusteriPenceresi({ ust, baslik, kapatAdresi, children }: {
  ust: string;
  baslik: string;
  kapatAdresi: string;
  children: ReactNode;
}) {
  const pencere = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const oge = pencere.current;
    if (oge && !oge.open) oge.showModal();
  }, []);

  return (
    <dialog
      ref={pencere}
      className="plt-pencere is-genis"
      aria-label={baslik}
      /*
        KAPANMA OLAYI KENDİSİNDEN Mİ GELDİ (15.10.2026)? İçeride başka bir
        <dialog> açılabiliyor (ürün penceresi, onay penceresi). Yerel
        `close` olayı kabarmıyor ama React onu kendi ağacında yukarı
        taşıyor: iç pencereyi kapatmak burayı da kapatıyor, kurucu
        "Vazgeç"e basınca kendini müşteri sayfasına atılmış buluyordu
        (canlıda ölçüldü). Portal da çözmüyor — React olayları DOM
        ağacında değil kendi ağacında taşıyor. Bu yüzden olayın hedefi
        soruluyor; iç pencerelere dokunmak gerekmiyor.
      */
      onClose={(olay) => { if (olay.target === pencere.current) router.replace(kapatAdresi, { scroll: false }); }}
      onClick={(olay) => { if (olay.target === pencere.current) pencere.current?.close(); }}
    >
      <div className="plt-pencere-govde">
        <header className="plt-pencere-bas">
          <div>
            <small>{ust}</small>
            <h2>{baslik}</h2>
          </div>
          <button type="button" className="plt-pencere-kapat" aria-label="Kapat" onClick={() => pencere.current?.close()}>×</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
