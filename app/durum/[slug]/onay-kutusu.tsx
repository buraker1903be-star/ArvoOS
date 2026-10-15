"use client";

import { useEffect, useRef, type ReactNode } from "react";
import "./status-lookup.css";

/*
  MÜŞTERİYE GÖRÜNEN ONAY KUTUSU (15.10.2026).

  Takip ekranında "Teklifi reddediyorum" düğmesi window.confirm ile
  soruluyordu. Tarayıcı bu kutuyu susturabiliyor (Chrome'un "bu sayfanın
  başka pencere açmasını engelle" seçeneği); susturulduğunda confirm()
  false dönüyor, kod da preventDefault() çağırıyor — yani düğme ÖLÜYOR.
  Kararı veremeyen kişi burada kurumun kendi müşterisi ve ekranda hiçbir
  açıklama yok. (Yönü itibarıyla güvenli bir arıza: yanlışlıkla ret
  olmuyor, hiç olmuyor. Yine de kurumun müşterisine gösterilen ekran.)

  Konsolun onay penceresinin (platform/onay-penceresi) aynısı değil:
  burası panel CSS'ini yüklemiyor, takip ekranının kendi paleti (--trk-*)
  kullanılıyor.
*/
export function TrkOnayKutusu({ acik, baslik, metin, onayEtiketi, onIptal, onOnay }: {
  acik: boolean;
  baslik: string;
  metin: ReactNode;
  onayEtiketi: string;
  onIptal: () => void;
  onOnay: () => void;
}) {
  const kutu = useRef<HTMLDialogElement>(null);

  /* showModal() elle: <dialog open> kipsiz açıyor — arka plan tıklanabilir
     kalıyor ve Esc çalışmıyor. */
  useEffect(() => {
    const oge = kutu.current;
    if (!oge) return;
    if (acik && !oge.open) oge.showModal();
    if (!acik && oge.open) oge.close();
  }, [acik]);

  return (
    <dialog
      ref={kutu}
      className="trk-onay"
      aria-label={baslik}
      onClose={onIptal}
      onClick={(olay) => { if (olay.target === kutu.current) onIptal(); }}
    >
      <div className="trk-onay-govde">
        <h2>{baslik}</h2>
        <p>{metin}</p>
        <div className="trk-onay-eylem">
          {/* Vazgeç önce ve vurgulu: yanlışlıkla açılan kutudan çıkış kolay olsun. */}
          <button type="button" className="trk-onay-vazgec" onClick={onIptal}>Vazgeç</button>
          <button type="button" className="trk-onay-evet" onClick={onOnay}>{onayEtiketi}</button>
        </div>
      </div>
    </dialog>
  );
}
