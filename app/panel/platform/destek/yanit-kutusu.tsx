"use client";

import { useRef } from "react";

/*
  YANIT KUTUSU + HAZIR YANIT SEÇİCİ (02.11.2026). Seçilen hazır yanıt
  kutuya EKLENİR (yazılanın üstüne yazmaz) ve {kurum} kurumun adıyla
  dolar; gönderim yine "Yanıtı gönder" ile, kurucu metni okuyup
  düzelttikten sonra. Kutunun adı "body": sunucu işlemi aynı.
*/
export function YanitKutusu({ hazirlar, kurum, placeholder }: { hazirlar: { id: string; baslik: string; metin: string }[]; kurum: string; placeholder: string }) {
  const kutu = useRef<HTMLTextAreaElement>(null);
  const ekle = (id: string) => {
    const y = hazirlar.find((h) => h.id === id);
    const k = kutu.current;
    if (!y || !k) return;
    const metin = y.metin.replaceAll("{kurum}", kurum);
    k.value = k.value.trim() ? `${k.value.trimEnd()}\n\n${metin}` : metin;
    k.focus();
  };
  return (
    <>
      {hazirlar.length ? (
        <label className="wide destek-hazir-sec">Hazır yanıt ekle
          <select defaultValue="" onChange={(e) => { ekle(e.target.value); e.target.value = ""; }}>
            <option value="">Seçin…</option>
            {hazirlar.map((h) => <option key={h.id} value={h.id}>{h.baslik}</option>)}
          </select>
        </label>
      ) : null}
      <label className="wide">Yanıtınız
        <textarea ref={kutu} name="body" required maxLength={5000} rows={6} placeholder={placeholder} />
      </label>
    </>
  );
}
