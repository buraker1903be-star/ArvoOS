"use client";

import { csvMetni } from "@/lib/csv";

/*
  CSV İNDİRME DÜĞMESİ (02.11.2026, konsolun aylık müşteri raporu).
  Satırlar sunucuda hazırlanıyor (sayfa sayıları zaten okudu); burada
  yalnızca dosyaya dönüşüyor — indirme için ayrı bir rota, yetki
  denetimini ikinci bir yerde tekrar etmek olurdu. Biçim lib/csv'de:
  noktalı virgül + BOM, Türkçe Excel'in doğrudan açtığı hâl.
*/
export function CsvIndir({ basliklar, satirlar, dosyaAdi, etiket = "CSV indir", aciklama }: {
  basliklar: string[];
  satirlar: (string | number | null)[][];
  dosyaAdi: string;
  etiket?: string;
  aciklama?: string;
}) {
  const indir = () => {
    const adres = URL.createObjectURL(new Blob([csvMetni(basliklar, satirlar)], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: adres, download: dosyaAdi });
    a.click();
    URL.revokeObjectURL(adres);
  };
  return <button type="button" className="panel-secondary" onClick={indir} disabled={!satirlar.length} title={aciklama}>{etiket}</button>;
}
