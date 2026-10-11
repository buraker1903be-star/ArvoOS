"use client";

import { useState } from "react";
import { alanAdiUyarisi, onerilenAlanAdi } from "@/lib/alan-adi";

/*
  ALAN ADI ALANI — yazarken uyaran form.

  Kurum kendi KÖK adresini (firma.com.tr) yazdığında panele bağlamak,
  web sitesini panele yönlendirmek demek; geri alması DNS yayılması
  kadar, yani saatler sürer. Uyarı kaydettikten SONRA gelirse geç
  kalmış olur, bu yüzden yazarken gösteriliyor.

  ENGELLEMİYOR: bazı kurumlar gerçekten kök adresi panele veriyor.
  Uyarının yanında önerilen alt alan adını tek tıkla yazan bir düğme
  var — doğru olanı yapmak, yanlışı engellemekten kolay olsun.
*/
export function AlanAdiFormu({ baslangic, canManage }: { baslangic: string; canManage: boolean }) {
  const [deger, setDeger] = useState(baslangic);
  const uyari = alanAdiUyarisi(deger);
  const oneri = onerilenAlanAdi(deger);

  return (
    <>
      <label className="wide">
        Alan adı
        <input
          name="custom_domain"
          value={deger}
          onChange={(olay) => setDeger(olay.target.value)}
          placeholder="panel.firmaniz.com"
          autoComplete="off"
          spellCheck={false}
          disabled={!canManage}
        />
      </label>
      {uyari ? (
        <p className="wide alan-adi-uyari" role="status">
          {uyari}
          {oneri ? (
            <button type="button" className="panel-secondary" onClick={() => setDeger(oneri)}>
              {oneri} yap
            </button>
          ) : null}
        </p>
      ) : null}
    </>
  );
}
