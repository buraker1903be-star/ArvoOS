"use client";

import { useEffect, useRef, useState } from "react";

/*
  KISALTILMIŞ ADIN TAMAMI — DOKUNMAYLA DA (10.11.2026, NAV-01).

  Genel bakış satırında müşteri/talep adı iki satırla sınırlı. Eskiden tam
  metin yalnızca fareyle (title) ve klavye odağıyla açılıyordu; dokunmatik
  ekranda okumanın tek yolu kayda girmekti. Bu düğme:
  - yalnızca metin GERÇEKTEN kısaltılmışsa görünür (ölçerek; geniş kartta
    ya da kısa adda düğme yok),
  - satırın bağlantısının DIŞINDA durur: basmak kayda gitmez, yalnızca
    satırı açar/kapatır,
  - klavyeyle de çalışır (gerçek düğme, aria-expanded).
  Ekran okuyucu için bir şey değişmez: kısaltma görsel, bağlantının adı
  zaten tam metin.
*/
export function TamMetinDugmesi() {
  const yer = useRef<HTMLSpanElement>(null);
  const [kisaltilmis, setKisaltilmis] = useState(false);
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    const satir = yer.current?.closest("li");
    if (!satir) return;
    const olc = () => {
      if (satir.classList.contains("is-acik")) return;
      /* İki satırla sınırlı (esnek kart) ya da tek satırda "…" (eski düzen) —
         ikisi de kısaltma. Mesaj önizlemesi bilerek tek satır; orada düğme yok. */
      const metinler = satir.querySelectorAll<HTMLElement>(".dash-col-main > b, .dash-col-main > small:not(.dash-col-preview)");
      setKisaltilmis([...metinler].some((m) => m.scrollHeight > m.clientHeight + 1 || m.scrollWidth > m.clientWidth + 1));
    };
    olc();
    const gozcu = new ResizeObserver(olc);
    gozcu.observe(satir);
    return () => gozcu.disconnect();
  }, []);

  const degistir = () => {
    const yeni = !acik;
    setAcik(yeni);
    yer.current?.closest("li")?.classList.toggle("is-acik", yeni);
  };

  return (
    <span ref={yer} className="dash-tam-metin">
      {kisaltilmis || acik ? (
        <button type="button" aria-expanded={acik} onClick={degistir}>
          {acik ? "Kısalt" : "Tamamını göster"}
        </button>
      ) : null}
    </span>
  );
}
