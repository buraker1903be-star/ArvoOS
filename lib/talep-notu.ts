/*
  Talep notundaki kapsam tekrarı.

  Web sitesinden gelen taleplerde not alanı "Kaynak: … · Hizmet: …"
  satırlarının ardından müşterinin yazdığı metni bir daha içeriyor; aynı
  metin kapsam alanında da var. Talep detayında iki kez alt alta
  görünüyordu. Not kapsamı içeriyorsa tekrar eden kısım çıkarılır; geriye
  yalnızca notun kendine ait satırları kalır, o da boşsa not gösterilmez.

  Karşılaştırma boşluk duyarsız (satır sonları ve çoklu boşluk); metnin
  kendisi değiştirilmez. Saf modül: birim testi talep-notu.test.ts.
*/

const sade = (metin: string) => metin.replace(/\s+/g, " ").trim();

export function tekrarsizNot(not: string | null | undefined, kapsam: string | null | undefined): string | null {
  const metin = (not ?? "").trim();
  if (!metin) return null;
  const k = sade(kapsam ?? "");
  if (!k || !sade(metin).includes(k)) return metin;

  /* Kapsamın nottaki yerini boşluklardan bağımsız bul: her boşluk dizisi
     \s+ ile eşleşsin. */
  const kalip = new RegExp(k.split(" ").map((parca) => parca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"));
  const kalan = metin.replace(kalip, "").replace(/\n{3,}/g, "\n\n").trim();
  return kalan || null;
}
