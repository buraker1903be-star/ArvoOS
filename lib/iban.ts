/*
  IBAN (29.10.2026) — saf. Konsolun banka hesapları ekranı ve proforma
  belgesi kullanıyor.

  Banka hesabı elle yazılıyor ve proformayla müşteriye gidiyor: tek bir
  yanlış hane, havalenin başka bir hesaba ya da hiçbir yere gitmesi
  demek. IBAN'ın kendi denetim hanesi var (ISO 13616, MOD-97); kayıtta
  bu hesaplanıyor, biçimi tutan ama yanlış yazılmış IBAN reddediliyor.
  Türkiye IBAN'ı TR + 24 hane (26 karakter).

  Testi tests/unit/iban.test.ts.
*/

/** Boşluk ve tireleri atar, büyük harfe çevirir. */
export const ibanTemizle = (ham: string) => ham.replace(/[\s-]+/g, "").toUpperCase();

/** "TR480006200115100006290081" → "TR48 0006 2001 1510 0006 2900 81". */
export const ibanYazisi = (iban: string) => ibanTemizle(iban).replace(/(.{4})/g, "$1 ").trim();

/** MOD-97 denetimi: ilk dört karakter sona alınır, harfler sayıya çevrilir, kalan 1 olmalı. */
function mod97(iban: string): number {
  const dizi = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (h) => String(h.charCodeAt(0) - 55));
  let kalan = 0;
  for (const rakam of dizi) kalan = (kalan * 10 + Number(rakam)) % 97;
  return kalan;
}

/** Geçersizse kullanıcıya gösterilecek açıklama; geçerliyse null. */
export function ibanHatasi(ham: string): string | null {
  const iban = ibanTemizle(ham);
  if (!iban) return "IBAN'ı yazın.";
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return "IBAN yalnızca harf ve rakam içerir; TR ile başlar.";
  if (iban.startsWith("TR") && iban.length !== 26) return `Türkiye IBAN'ı 26 karakterdir; yazılan ${iban.length} karakter.`;
  if (iban.length < 15 || iban.length > 34) return "IBAN uzunluğu geçersiz.";
  if (mod97(iban) !== 1) return "IBAN'ın denetim hanesi tutmuyor; bir hane yanlış yazılmış olabilir.";
  return null;
}
