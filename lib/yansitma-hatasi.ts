/*
  KÖPRÜ SONUCUNU HATA MESAJINA ÇEVİRME — SAF VE TEK YERDE.

  Üç ürün köprüsü (ArvoLab, ArvoARC, Randevu) aynı üç hâli
  döndürüyor: yazıldı, yazılamadı, köprü kapalı. Karar üç ayrı `if`
  bloğunda elle yazılıydı ve SAPMIŞTI: "köprü kapalı" hâli ArvoLab
  ile Randevu'da hata sayılıyor, ArvoARC'ta sayılmıyordu. Yani ortam
  değişkenleri girilmemiş (ya da girilip yeniden dağıtılmamış) bir
  kurulumda ArvoARC lisansı yansımıyor, kurucu ekranında işlem
  BAŞARILI görünüyordu — ArvoARC 19.09.2026'dan beri bu kopyaya
  bağımlı olduğu için mağaza hiç açılmıyor ve sebebi hiçbir yerde
  yazmıyordu (17.10.2026).

  Karar artık tablodan: yeni bir ürün köprüsü eklenince üç hâli
  yeniden düşünmek gerekmiyor. Saf olduğu için testi var
  (tests/unit/yansitma-hatasi.test.ts).
*/
export type KopruSonucu = { status: string; errors?: readonly string[] };

const KOPRULER: Record<string, { ad: string; yonelme: string; degiskenler: string }> = {
  arvolab: { ad: "ArvoLab", yonelme: "ArvoLab'a", degiskenler: "ARVOLAB_SUPABASE_URL / ARVOLAB_SUPABASE_SECRET_KEY" },
  arc: { ad: "ArvoARC", yonelme: "ArvoARC'a", degiskenler: "ARC_SUPABASE_URL / ARC_SUPABASE_SECRET_KEY" },
  randevu: { ad: "Randevu", yonelme: "Randevu'ya", degiskenler: "RANDEVU_SUPABASE_URL / RANDEVU_SUPABASE_SECRET_KEY" },
};

/** Köprüsü olmayan ürünler için null. */
export const kopruluUrun = (urun: string) => Boolean(KOPRULER[urun]);

/**
 * Yansıtma sonucunun kurucuya gösterilecek hata metni; sorun yoksa
 * null. Mesajlar "lisans kaydedildi AMA …" diye başlıyor: kayıt
 * geçerli, yansımayan şey ürün tarafındaki kopya.
 */
export function yansitmaHatasi(urun: string, sonuc: KopruSonucu): string | null {
  const kopru = KOPRULER[urun];
  if (!kopru) return null;

  if (sonuc.status === "not_configured") {
    return `Lisans kaydedildi ancak ${kopru.ad} köprüsü kapalı (${kopru.degiskenler}). Değişkenleri ekleyip yeniden dağıtın, sonra tekrar yansıtın.`;
  }
  if (sonuc.status === "failed" || (sonuc.errors?.length ?? 0) > 0) {
    return `Lisans kaydedildi ancak ${kopru.yonelme} yansıtılamadı: ${sonuc.errors?.[0] ?? "bilinmeyen hata"}. Bağlantı ayarlarını kontrol edip tekrar kaydedin.`;
  }
  /* "partial" de errors dolu geliyor, yukarıdaki dalda yakalanıyor. */
  return null;
}
