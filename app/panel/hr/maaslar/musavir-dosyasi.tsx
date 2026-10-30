"use client";

import { csvMetni } from "@/lib/csv";

/*
  MÜŞAVİR DOSYASI (CSV). Satırlar sunucuda hazırlanıyor (sayfa zaten
  bütün sayıları okudu), burada yalnızca dosyaya dönüşüyor: indirme için
  ayrı bir rota yazmak yetki kontrolünü ikinci bir yerde tekrar etmek
  demekti. Biçim lib/csv'de: noktalı virgül + BOM, Türkçe Excel'in
  doğrudan açtığı hâl.
*/
export function MusavirDosyasi({ basliklar, satirlar, dosyaAdi }: {
  basliklar: string[];
  satirlar: (string | number | null)[][];
  dosyaAdi: string;
}) {
  const indir = () => {
    const adres = URL.createObjectURL(new Blob([csvMetni(basliklar, satirlar)], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: adres, download: dosyaAdi });
    a.click();
    URL.revokeObjectURL(adres);
  };
  return (
    <button type="button" className="panel-secondary" onClick={indir} disabled={!satirlar.length}
      title="Ayın maaş, izin ve prim bilgisini müşavire gönderilecek tablo olarak indir">
      Müşavir dosyası (CSV)
    </button>
  );
}
