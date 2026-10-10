"use client";

import { useRef } from "react";

/*
  HAZIR CEVAP SEÇİCİ.

  Seçilen metin yanıt kutusuna düşüyor. Yer tutucular SUNUCUDA değil
  burada dolduruluyor: metni kullanıcıya göndermeden önce göstermek
  gerekiyor — ne gittiğini görmeden "gönder"e basmak, hazır cevabın en
  büyük riski.

  KUTUDAKİ YAZI KORUNUYOR. Metin imlecin olduğu yere ekleniyor; kutu
  doluyken üzerine yazsaydı, yarım kalmış bir cevabı sessizce silerdi.
*/
export function HazirCevapSec({ hedefId, sablonlar, degerler }: {
  hedefId: string;
  sablonlar: { id: string; ad: string; govde: string }[];
  degerler: { musteri: string; ben: string; kurum: string };
}) {
  const secim = useRef<HTMLSelectElement>(null);

  if (!sablonlar.length) return null;

  const uygula = (id: string) => {
    const sablon = sablonlar.find((aday) => aday.id === id);
    const kutu = document.getElementById(hedefId) as HTMLTextAreaElement | null;
    if (!sablon || !kutu) return;

    /* Yer tutucu doldurma istemcide tekrarlanıyor (lib/posta-sablon.ts
       ile aynı kural): sunucuya gidip gelmek, her seçimde bir tur
       demekti ve metin zaten kullanıcıya gösterilecek. */
    const metin = sablon.govde.replace(/([ \t]*)\{\{\s*([A-Za-z_]+)\s*\}\}/g, (tamami, bosluk: string, anahtar: string) => {
      const deger = degerler[anahtar.toLowerCase() as keyof typeof degerler];
      if (deger === undefined) return tamami;
      return deger.trim() ? `${bosluk}${deger.trim()}` : "";
    }).split("\n").map((satir) => satir.replace(/^[ \t]+/, "").replace(/[ \t]+([,.;:!?])/g, "$1")).join("\n").trimEnd();

    const bas = kutu.selectionStart ?? kutu.value.length;
    const son = kutu.selectionEnd ?? bas;
    const onceki = kutu.value;
    const ayrac = onceki.slice(0, bas).trim() ? "\n\n" : "";
    kutu.value = `${onceki.slice(0, bas)}${ayrac}${metin}${onceki.slice(son)}`;
    const imlec = bas + ayrac.length + metin.length;
    kutu.setSelectionRange(imlec, imlec);
    kutu.focus();
    /* React kontrolsüz alanı izlemiyor ama taslak kaydeden form value'yu
       okuyor; yine de olay yayılsın ki dinleyen bir şey olursa görsün. */
    kutu.dispatchEvent(new Event("input", { bubbles: true }));
    if (secim.current) secim.current.value = "";
  };

  return (
    <label className="posta-hazir-sec">
      <span>Hazır cevap</span>
      <select ref={secim} defaultValue="" onChange={(olay) => uygula(olay.target.value)} aria-label="Hazır cevap ekle">
        <option value="">Seçin…</option>
        {sablonlar.map((sablon) => <option key={sablon.id} value={sablon.id}>{sablon.ad}</option>)}
      </select>
    </label>
  );
}
