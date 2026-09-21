/*
  Hazır mesajlar: metin şablonu ve önerilen başlangıç listesi.

  Aynı cevaplar (fiyat, demo randevusu, "dönüş yapacağız") her seferinde
  elle yazılıyordu; yazım her seferinde biraz farklı çıkıyor, acelede
  müşterinin adı yanlış yazılıyordu.

  Metinde tek yer tutucu var: {ad}. Daha fazlasını (tutar, tarih) bilerek
  koymadım — serbest metin yalnızca 24 saatlik pencerede gidiyor ve o
  pencerede yazan kişi zaten ekranın başında; doldurulmamış bir {tutar}
  müşteriye olduğu gibi gitseydi hazır mesaj faydadan çok zarar olurdu.
  Adın doldurulmaması ise tehlikesiz: yer tutucu sessizce düşer.
*/

export type HazirMesaj = {
  /** Listede görünen kısa ad. */
  title: string;
  /** Gönderilecek metin; {ad} yer tutucusu içerebilir. */
  body: string;
};

/**
 * {ad} yer tutucusunu doldurur.
 *
 * Ad yoksa yer tutucu düşer ve arkasında bırakacağı boşluk/noktalama
 * temizlenir: "Merhaba {ad}, ..." → "Merhaba, ...". Eskiden düz bir
 * replace düşünülmüştü; adsız numarada müşteriye "Merhaba , ..." giderdi.
 */
export function hazirMesajiDoldur(govde: string, ad?: string | null): string {
  const isim = (ad ?? "").trim();
  if (isim) return govde.replaceAll("{ad}", isim);
  return govde
    .replaceAll(/ *\{ad\}/g, "")
    // Yer tutucu cümle başındaysa geriye "Merhaba , ..." değil "Merhaba, ..." kalsın.
    .replaceAll(/ +([,.!?;:])/g, "$1")
    .replaceAll(/ {2,}/g, " ")
    .trim();
}

/**
 * Önerilen başlangıç listesi.
 *
 * Her kuruma satır kopyalamak yerine kodda duruyor: yeni kurum açıldığında
 * kopyalamayı unutma ihtimali yok ve kurum kendi listesini yazdığı anda
 * öneriler kenara çekiliyor. Kaydedilmeden de kullanılabilirler.
 */
export const ONERILEN_HAZIR_MESAJLAR: readonly HazirMesaj[] = [
  {
    title: "Karşılama",
    body: "Merhaba {ad}, Arvo'dan yazıyorum. Size nasıl yardımcı olabilirim?",
  },
  {
    title: "Fiyat bilgisi",
    body: "Merhaba {ad}, paket ve fiyat bilgimizi hemen iletiyorum. Kaç kullanıcı için düşündüğünüzü öğrenebilir miyim?",
  },
  {
    title: "Demo randevusu",
    body: "Merhaba {ad}, 20 dakikalık çevrim içi bir tanıtım ayarlayalım mı? Size uygun gün ve saati yazmanız yeterli.",
  },
  {
    title: "Teklif gönderildi",
    body: "Merhaba {ad}, teklifinizi ilettik. İncelediğinizde sorularınızı buradan yazabilirsiniz.",
  },
  {
    title: "Deneme süresi",
    body: "Merhaba {ad}, deneme sürenizde takıldığınız bir yer olursa buradan yazmanız yeterli; aynı gün dönüş yapıyoruz.",
  },
  {
    title: "Dönüş yapacağız",
    body: "Merhaba {ad}, mesajınızı aldık. İlgili arkadaşımız en kısa sürede size dönecek.",
  },
  {
    title: "Kapanış",
    body: "Teşekkür ederiz {ad}. İyi çalışmalar dileriz.",
  },
];

/**
 * Kurumun kayıtlı listesi ile önerileri birleştirir.
 *
 * Kurum kendi metnini yazdıysa öneri gösterilmez: aynı işi yapan iki
 * metinden hangisinin gideceği kullanıcıya kalırdı. Ölçüt başlık, çünkü
 * kurum genelde öneriyi kaydedip gövdesini kendine göre değiştiriyor.
 */
export function hazirMesajListesi<T extends HazirMesaj>(kayitli: T[]): { kendi: T[]; onerilen: HazirMesaj[] } {
  const adlar = new Set(kayitli.map((m) => m.title.trim().toLocaleLowerCase("tr-TR")));
  return {
    kendi: kayitli,
    onerilen: ONERILEN_HAZIR_MESAJLAR.filter((m) => !adlar.has(m.title.toLocaleLowerCase("tr-TR"))),
  };
}
