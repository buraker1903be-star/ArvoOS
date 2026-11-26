/*
  ÜRÜN DETAYININ BÖLÜMLERİ ADRESTE (26.11.2026, ürün kararı).

  Ürün kartının altı sekmesi bileşenin KENDİ durumundaydı: Abonelikler'i
  açıp bağlantıyı paylaşan ya da sayfayı yenileyen Genel Bakış'a
  dönüyordu, tarayıcının geri tuşu sekme değişimini hiç görmüyordu ve
  "ArvoLab'ın abonelikleri" diye bir adres yoktu. Seçim artık sorgu
  parametresinde: /panel/platform/urunler/arvolab?bolum=abonelikler.

  Neden sorgu parametresi, neden yeni bir alt rota değil: sayfanın bütün
  bölümleri AYNI sunucu okumasından besleniyor (lisans satırları, abone
  listesi, tahsilat, destek aynı sorgularla geliyor). Alt rotaya bölmek
  her bölüm için okumayı yeniden kurmak demekti; sorgu parametresi aynı
  rotayı koruyup derin bağlantıyı, yenilemeyi ve geri/ileri davranışını
  veriyor. Dönem seçici de aynı yolu kullanıyor (?donem=), ikisi bir
  arada yaşıyor.

  Saf modül: birim testi tests/unit/urun-bolumleri.test.ts.
*/

/** Bölüm anahtarları; sıra ekrandaki sekme sırası. */
export const URUN_BOLUM_ANAHTARLARI = [
  "genel-bakis",
  "musteriler",
  "fiyat",
  "abonelikler",
  "tahsilat",
  "destek",
] as const;

export type UrunBolumu = (typeof URUN_BOLUM_ANAHTARLARI)[number];

export const VARSAYILAN_URUN_BOLUMU: UrunBolumu = "genel-bakis";

/** Adresten gelen ham değer → bilinen bölüm. Bilinmeyen her şey Genel Bakış. */
export function urunBolumu(ham: unknown): UrunBolumu {
  return typeof ham === "string" && (URUN_BOLUM_ANAHTARLARI as readonly string[]).includes(ham)
    ? (ham as UrunBolumu)
    : VARSAYILAN_URUN_BOLUMU;
}

/**
 * Seçili bölümün çizilen sekmeler içindeki sırası.
 *
 * Sekme listesi koşullu: bireysel aboneliği olmayan üründe "Abonelikler"
 * hiç çizilmiyor. Adreste olmayan bir bölüm istendiğinde ilk sekmeye
 * düşülür — var olmayan bir panele "seçili" demek boş kart demekti.
 */
export function bolumSirasi(anahtarlar: readonly string[], secili: string): number {
  const sira = anahtarlar.indexOf(secili);
  return sira >= 0 ? sira : 0;
}

/**
 * Bölüm bağlantısı; dönem seçimi KORUNUR.
 *
 * İki parametre birbirini silmemeli: dönemi seçip bölüm değiştiren
 * kullanıcı "Son 90 gün"ü kaybetmez (dönem seçicisinin kendisi de
 * bölümü aynı biçimde taşıyor).
 */
export function bolumAdresi(taban: string, anahtar: string, donem?: string | null): string {
  const sorgu = new URLSearchParams();
  if (anahtar && anahtar !== VARSAYILAN_URUN_BOLUMU) sorgu.set("bolum", anahtar);
  if (donem) sorgu.set("donem", donem);
  const metin = sorgu.toString();
  return metin ? `${taban}?${metin}` : taban;
}
