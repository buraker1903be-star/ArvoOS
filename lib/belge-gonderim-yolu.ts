/*
  Teklif/sözleşme müşteriye hangi yoldan gidecek: panelden mi, WhatsApp
  Web'den mi?

  Kural şu farktan doğuyor: gelen kutusundan verilen YANIT ile kurumun
  müşterisine gönderdiği BELGE aynı şey değil.

  - Yanıtta müşteri zaten Arvo'nun numarasına yazmıştır; aynı numaradan
    cevap almak doğaldır.
  - Belge ise iş tarafının başlattığı bir mesaj. Kendi numarasını
    bağlamamış bir kurumun teklifi Arvo'nun numarasından giderse, müşteri
    hiç tanımadığı bir numaradan teklif almış olur — kurumun kendi
    kimliğiyle gönderdiği izlenimi de yanlış olur.

  Bu yüzden panelden gönderim yalnızca iki durumda açık:
    1. Kurum kendi WhatsApp numarasını bağlamışsa (mesaj onun adından gider).
    2. Kurum Arvo'nun kendisiyse (ortak numara zaten onun numarası).

  Diğer her durumda eski usul devam ediyor: personel WhatsApp Web'den
  kendi hesabıyla gönderir. Numara bağlamak istemeyen kurumu bu yüzden
  gönderimsiz bırakmıyoruz.
*/

export type GonderimYolu = "panel" | "whatsapp-web";

export function belgeGonderimYolu(girdi: {
  /** Kurumun kendi WhatsApp Business numarası bağlı ve kapalı değil mi. */
  kendiNumarasiBagli: boolean;
  /** organizations.kind === 'internal' — Arvo'nun kendi kurumu. */
  arvoKurumu: boolean;
}): GonderimYolu {
  return girdi.kendiNumarasiBagli || girdi.arvoKurumu ? "panel" : "whatsapp-web";
}
