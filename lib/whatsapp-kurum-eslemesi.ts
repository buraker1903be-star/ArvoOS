/*
  Gelen WhatsApp mesajının hangi kuruma yazılacağı.

  Karar üç ipucuna dayanıyor ve sırası önemli:

  1. Bildirimi alan numara bir kurumun BAĞLI numarasıysa mesaj onundur.
     En kesin ipucu: müşteri doğrudan o işletmenin numarasına yazmış.
  2. Numara Arvo'nun ortak numarasıysa, aynı kişiye Arvo adına gönderilmiş
     son mesajın kurumu kullanılır — müşteri kime cevap veriyorsa odur.
  3. Hiç yazışma yoksa mesaj ARVO'NUN KENDİ kurumuna yazılır
     (organizations.kind = 'internal').

  Üçüncü adım sonradan eklendi. Eskiden bu durumda mesaj hiç yazılmıyor,
  yalnızca sunucu günlüğüne bir satır düşüyordu: Arvo'nun numarasına ilk
  kez yazan biri (kimsenin ona daha önce mesaj göndermediği bir müşteri,
  bir aday, numarayı bir yerde görmüş biri) sessizce kayboluyordu. Kişi
  işletmeye ulaştığını sanıyor, karşı tarafta kimse görmüyordu.

  Arvo'nun numarasına yazan kişi aslında Arvo'ya yazmıştır; mesajın Arvo'nun
  gelen kutusuna düşmesi hem doğru hem de görünür olmasının tek yolu.
  Tahmin edip rastgele bir müşteri kurumuna yazmak daha kötü olurdu: o
  kurumun personeli kendisine ait olmayan bir yazışmayı görürdü.

  Saf modül; testi tests/unit/whatsapp-kurum-eslemesi.test.ts.
*/

export type KurumIpuclari = {
  /** Numara bir kuruma bağlıysa o kurumun kimliği. */
  bagliKurumId?: string | null;
  /** Bildirim Arvo'nun ortak numarasına mı geldi? */
  arvoNumarasi: boolean;
  /** Aynı kişiye Arvo adına gönderilmiş son mesajın kurumu. */
  sonYazismaKurumId?: string | null;
  /** Arvo'nun kendi kurumu (organizations.kind = 'internal'). */
  arvoKurumId?: string | null;
};

export type KurumEslemesi = {
  organizationId: string;
  /** Karar hangi ipucundan çıktı; günlükte ve gelen kutusunda anlam taşır. */
  kaynak: "bagli_numara" | "son_yazisma" | "arvo_kurumu";
};

/**
 * Mesajın kurumunu belirler; belirlenemezse null.
 *
 * null yalnızca iki durumda döner: numara ne bir kuruma bağlı ne de
 * Arvo'nunki (tanımadığımız bir numaraya gelen bildirim), ya da Arvo'nun
 * kendi kurumu kayıtlı değil. İkisi de kurulum hatasıdır; mesajı bir yere
 * yazmak için uydurma kurum seçilmez.
 */
export function gelenMesajinKurumu(ipuclari: KurumIpuclari): KurumEslemesi | null {
  if (ipuclari.bagliKurumId) {
    return { organizationId: ipuclari.bagliKurumId, kaynak: "bagli_numara" };
  }

  // Bağlı numara değilse yalnızca Arvo'nun numarası için devam edilir.
  if (!ipuclari.arvoNumarasi) return null;

  if (ipuclari.sonYazismaKurumId) {
    return { organizationId: ipuclari.sonYazismaKurumId, kaynak: "son_yazisma" };
  }

  if (ipuclari.arvoKurumId) {
    return { organizationId: ipuclari.arvoKurumId, kaynak: "arvo_kurumu" };
  }

  return null;
}
