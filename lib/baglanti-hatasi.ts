/*
  SUNUCU İŞLEMİNİN İSTEĞİ KOPTUĞUNDA (F6 PR7).

  runPanelAction sunucuda düşen her hatayı bildirim çerezine yazıyor; ama
  isteğin KENDİSİ koparsa (ağ, uyku moduna giren dizüstü, yeniden başlayan
  sunucu) tarayıcıda "Failed to fetch" fırlıyor ve çerez hiç gelmiyor.
  Eskiden bu yakalanmıyordu: kullanıcı hiçbir mesaj görmüyor, düğme yeniden
  açılıyordu — oysa istek sunucuya ulaşıp kayıt YAZILMIŞ olabilir (gerçek
  Next.js'te ölçüldü: yanıtı kaybolan istek satırı yazdı, ekran sustu).

  Mesaj bu yüzden "olmadı" demiyor, "bilinmiyor" diyor ve güvenli yolu
  söylüyor: faaliyet formu istek anahtarını KORUR, aynı form yeniden
  gönderilince ikinci kayıt oluşmaz (aynı içerik "tekrar", değişen içerik
  DP002). Saf modül; test: tests/unit/baglanti-hatasi.test.ts.
*/
export const BAGLANTI_KOPTU =
  "Bağlantı koptu; işlemin sonucu bilinmiyor. Sayfayı yenilemeden formu olduğu gibi yeniden gönderin — kayıt yapıldıysa ikinci kez oluşmaz.";

export const BAGLANTI_KOPTU_GENEL =
  "Bağlantı koptu; işlemin sonucu bilinmiyor. Sayfayı yenileyip sonucu kontrol edin.";

/** Sunucu işleminin isteğinin kendisi mi koptu (sunucunun verdiği bir hata değil)? */
export function baglantiHatasiMi(hata: unknown): boolean {
  if (!(hata instanceof Error)) return false;
  return hata.name === "TypeError" && /fetch|network|load failed|ağ/i.test(hata.message);
}
