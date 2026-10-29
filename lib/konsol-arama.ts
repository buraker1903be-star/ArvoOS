/*
  KONSOL ARAMASI (29.10.2026) — saf kural.

  Ctrl+K'ya yazılan metin konsolun üç kaydında aranıyor: müşteri (kurum ve
  bireysel abone), kullanıcı ve proforma. Bu dosya eşleşme ve sıralama
  kuralı; okuma app/panel/platform/ara/page.tsx'te. Birim testi
  tests/unit/konsol-arama.test.ts.

  TÜRKÇE DUYARSIZ: "işçi" ile "ISCI", "Şirket" ile "sirket" eşleşir.
  Kurucu kurum adını aksansız, küçük harfle yazıyor; Postgres'in ilike'ı
  "ş"yi "s" saymıyor. Bu yüzden küçük tablolar (kurumlar, kullanıcılar)
  bellekte bu kuralla süzülüyor.

  BÜTÜN KELİMELER: "akademik merkez" iki kelimenin de geçtiği kaydı bulur,
  sırası önemli değil ("merkez akademik" da bulur).

  SIRALAMA: adı aramayla BAŞLAYAN önce, sonra adında geçen, sonra yalnızca
  öteki alanlarda (e-posta, telefon, alan adı) geçen.
*/
export function sadelestir(deger: string): string {
  return (deger ?? "")
    .replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/\s+/g, " ").trim();
}

/** 0: eşleşmiyor, 3: ad sorguyla başlıyor, 2: adda geçiyor, 1: başka alanda geçiyor. */
export function eslesmePuani(ad: string, diger: (string | null | undefined)[], sorgu: string): number {
  const kelimeler = sadelestir(sorgu).split(" ").filter(Boolean);
  if (!kelimeler.length) return 0;
  const sadeAd = sadelestir(ad);
  const hepsi = `${sadeAd} ${diger.filter(Boolean).map((d) => sadelestir(d!)).join(" ")}`;
  // Telefonla aranıyorsa rakamlar boşluksuz karşılaştırılıyor ("0532 111" ↔ "+90 532 111 22 33").
  const rakam = sorgu.replace(/\D/g, "");
  const telefonla = rakam.length >= 3 && rakam.length === sorgu.replace(/[\s+()-]/g, "").length;
  if (telefonla && diger.some((d) => (d ?? "").replace(/\D/g, "").includes(rakam.replace(/^0+/, "")))) return 1;
  if (!kelimeler.every((k) => hepsi.includes(k))) return 0;
  if (sadeAd.startsWith(kelimeler.join(" "))) return 3;
  return kelimeler.every((k) => sadeAd.includes(k)) ? 2 : 1;
}

export function ara<T>(liste: T[], sorgu: string, alanlar: (x: T) => { ad: string; diger: (string | null | undefined)[] }, sinir = 20): T[] {
  return liste
    .map((x) => { const a = alanlar(x); return { x, puan: eslesmePuani(a.ad, a.diger, sorgu), ad: a.ad }; })
    .filter((s) => s.puan > 0)
    .sort((a, b) => b.puan - a.puan || a.ad.localeCompare(b.ad, "tr"))
    .slice(0, sinir)
    .map((s) => s.x);
}
