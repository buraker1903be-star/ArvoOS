"use client";

import { useState } from "react";
import { aramaAnahtari } from "../os/os-apps";

/*
  KILAVUZDA ARAMA. Konular sunucuda çizili; burada yalnızca eşleşmeyenler
  gizleniyor (data-ara, lib/kilavuz aramaMetni). Arama sunucuya gitmiyor:
  kılavuz birkaç bin kelime, her harfte istek atmak yazanı bekletirdi.
  Türkçe büyük/küçük harf ve aksan duyarsız (Ctrl+K ile aynı anahtar):
  "sozlesme" yazan "Sözleşme"yi bulur.
*/
export function KilavuzArama() {
  const [sorgu, setSorgu] = useState("");
  const [bos, setBos] = useState(false);

  const ara = (deger: string) => {
    setSorgu(deger);
    const anahtar = aramaAnahtari(deger.trim());
    let gorunen = 0;
    document.querySelectorAll<HTMLElement>("[data-kilavuz-bolum]").forEach((bolum) => {
      let bolumde = 0;
      bolum.querySelectorAll<HTMLDetailsElement>("[data-ara]").forEach((konu) => {
        const tutar = !anahtar || (konu.dataset.ara ?? "").includes(anahtar);
        konu.hidden = !tutar;
        /* Aranırken eşleşen konu açılıyor: kapalı başlık listesinde
           kelimenin nerede geçtiğini görmek için her birine tıklamak gerekirdi. */
        if (anahtar) konu.open = tutar;
        if (tutar) bolumde += 1;
      });
      bolum.hidden = bolumde === 0;
      gorunen += bolumde;
    });
    setBos(Boolean(anahtar) && gorunen === 0);
  };

  return (
    <div className="kilavuz-arama">
      <input type="search" value={sorgu} onChange={(e) => ara(e.target.value)} placeholder="Kılavuzda ara: teklif, tahsilat, yetki…"
        aria-label="Kılavuzda ara" autoComplete="off" />
      {bos ? <p className="kilavuz-bos" role="status">Bu kelimeyle bir konu yok. Destek ekibine sorabilirsiniz.</p> : null}
    </div>
  );
}
