/*
  CSV ÜRETİMİ (29.10.2026, konsol müşteri listesinin dışa aktarımı) — saf.

  Ayırıcı NOKTALI VİRGÜL ve dosyanın başında UTF-8 imi (BOM): Türkçe
  Excel virgülü ondalık ayırıcı sayıyor, virgüllü bir CSV'yi tek sütuna
  yığıyor; BOM olmadan da "Şirket" "Åžirket" görünüyor. Değer ayırıcı,
  tırnak ya da satır sonu içeriyorsa tırnağa alınıyor ve içindeki tırnak
  ikileniyor (RFC 4180).

  Formül enjeksiyonu: "=", "+", "-", "@" ile başlayan bir hücreyi Excel
  formül olarak çalıştırıyor. Müşteri adını müşteri yazıyor; başına tek
  tırnak konuyor (OWASP önerisi), değer görünürde aynı kalıyor.
*/
const AYIRICI = ";";

export function csvHucresi(deger: string | number | null | undefined): string {
  if (deger === null || deger === undefined) return "";
  let metin = String(deger);
  if (typeof deger === "string" && /^[=+\-@\t\r]/.test(metin)) metin = `'${metin}`;
  return /[";\r\n]/.test(metin) ? `"${metin.replace(/"/g, '""')}"` : metin;
}

export function csvMetni(basliklar: string[], satirlar: (string | number | null | undefined)[][]): string {
  return "﻿" + [basliklar, ...satirlar].map((s) => s.map(csvHucresi).join(AYIRICI)).join("\r\n") + "\r\n";
}

/** Kuruş → "1234,50" (Excel'in Türkçe sayı biçimi; para simgesi yok, toplanabilsin). */
export const csvTutar = (kurus: number | null | undefined) =>
  kurus === null || kurus === undefined ? "" : (kurus / 100).toFixed(2).replace(".", ",");
