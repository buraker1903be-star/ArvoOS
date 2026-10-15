/*
  KİMLİK BİÇİMİ: BOZUK ADRES "KAYIT YOK"TUR, ÇÖKME DEĞİL.

  Detay sayfaları adresten gelen kimliği doğrudan sorguya veriyordu.
  Postgres uuid olmayan bir değeri reddediyor (22P02, "invalid input
  syntax for type uuid"), sayfa da bunu gerçek okuma hatası sayıp
  fırlatıyor: kullanıcı "İŞLEM TAMAMLANAMADI · Bir sorun oluştu · Hata
  kodu: …" görüyordu. 16.10.2026'da canlıda ölçüldü — sözleşme, teklif,
  revizyon, personel, belge, erişim geçmişi ve kişi yetkileri
  ekranlarının yedisi birden çöküyordu, altı kardeş ekran ise aynı
  adreste doğru biçimde "kayıt bulunamadı" veriyordu.

  Gerçekçi yol: bağlantının kırpılması. WhatsApp'ta ya da e-postada
  satır sonuna denk gelen bir sözleşme adresi yarım gidiyor; müşteri ya
  da personel tıklayınca ürünün bozulduğunu sanıyor.

  Denetim sorgudan ÖNCE: var olmayan kayıt zaten notFound() veriyor,
  bozuk kimlik de aynı kapıya çıkmalı. Biçim denetimi aynı zamanda
  veritabanına gereksiz bir istek göndermiyor.
*/

const UUID_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adresten gelen değer uuid biçiminde mi? */
export function kimlikMi(deger: string | undefined | null): boolean {
  return typeof deger === "string" && UUID_DESENI.test(deger);
}
