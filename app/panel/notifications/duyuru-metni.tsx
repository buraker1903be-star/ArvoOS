"use client";

import { useEffect, useRef, useState } from "react";

/*
  Uzun duyuru metni.

  Bildirim gövdesi altı satırda kesiliyordu ve devamını okumanın yolu
  yoktu: duyurularda eylem bağlantısı da çizilmediği için metnin kalanı
  hiçbir yerde görünmüyordu. Kurucu 2000 karakter yazabiliyor, kurum
  yaklaşık 400 karakterini okuyabiliyordu — sessizce kaybolan bir duyuru,
  gönderilmemiş duyurudan kötü.

  Kesilme ÖLÇÜLEREK anlaşılıyor, karakter sayısıyla tahmin edilmiyor:
  satır uzunluğu ekran genişliğine göre değişiyor, telefonda kesilen bir
  metin masaüstünde tam sığabiliyor. Düğme yalnızca gerçekten kesilen
  metinde çiziliyor.
*/

export function DuyuruMetni({ metin }: { metin: string }) {
  const paragraf = useRef<HTMLParagraphElement>(null);
  const [kesik, setKesik] = useState(false);
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    const oge = paragraf.current;
    if (!oge) return;
    const olc = () => {
      // Açıkken kesilme ölçülemez; kapatılana kadar düğme korunuyor.
      if (acik) return;
      setKesik(oge.scrollHeight > oge.clientHeight + 1);
    };
    olc();
    /* Pencere daraldığında satır sayısı değişiyor: masaüstünde sığan
       metin telefon genişliğinde kesiliyor. */
    const gozlemci = new ResizeObserver(olc);
    gozlemci.observe(oge);
    return () => gozlemci.disconnect();
  }, [acik, metin]);

  return (
    <>
      <p className={acik ? "ntf-detail is-acik" : "ntf-detail"} ref={paragraf}>{metin}</p>
      {kesik ? (
        <button className="ntf-devam" type="button" onClick={() => setAcik((onceki) => !onceki)} aria-expanded={acik}>
          {acik ? "Kısalt" : "Devamını göster"}
        </button>
      ) : null}
    </>
  );
}
