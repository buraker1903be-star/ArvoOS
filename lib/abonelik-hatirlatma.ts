/*
  Abonelik ve deneme hatırlatmasının şablon eşlemesi.

  Ayrı bir dosyada, çünkü burada yazan adlar Meta'daki şablonun içindeki
  adlarla BİREBİR aynı olmak zorunda. Tutmazsa Meta 132012 ("parameter
  format mismatch") döndürüyor ve hata mesajı hangi adın yanlış olduğunu
  söylemiyor. Tek yerde durursa düzeltmek tek satır; gönderim kodunun
  içine serpiştirilseydi her seferinde aranması gerekirdi.

  Şablonlar Meta'da onaylı (Bilgilendirme kategorisi). Deneme
  hatırlatmasında ÜCRET BİLEREK YOK: fiyat geçen bir bildirim Meta'nın
  gözünde satış mesajı oluyor ve şablon pazarlamaya çekiliyor. Pazarlamaya
  düşen bir bildirim, pazarlamadan çıkmış müşteriye hiç ulaşmıyor — oysa
  deneme süresinin bittiğini en çok onun bilmesi gerekiyor.
*/

export type HatirlatmaTuru = "trial" | "renewal";

export type HatirlatmaDegerleri = {
  /** Kurumun görünen adı. */
  abone: string;
  /** Ürün adı (ArvoOS, ArvoLab…). */
  urun: string;
  /** Bitiş tarihi, okunur biçimde. */
  tarih: string;
  /** Aylık ücret, biçimlenmiş. Yalnızca yenileme şablonunda kullanılıyor. */
  ucret?: string;
};

type Sablon = {
  ad: string;
  /** Şablonun beklediği değişkenler; sırası değil adları önemli. */
  parametreler: (deger: HatirlatmaDegerleri) => Record<string, string>;
  /** Ücret zorunlu mu; zorunluysa girilmemişken gönderim engelleniyor. */
  ucretGerekir: boolean;
};

export const HATIRLATMA_SABLONLARI: Record<HatirlatmaTuru, Sablon> = {
  trial: {
    ad: "deneme_suresi_son_gun",
    parametreler: ({ abone, urun, tarih }) => ({ abone, urun, tarih }),
    ucretGerekir: false,
  },
  renewal: {
    ad: "abonelik_yenileme",
    parametreler: ({ abone, urun, tarih, ucret }) => ({ abone, urun, tarih, ucret: ucret ?? "" }),
    ucretGerekir: true,
  },
};

/**
 * Şablonla gönderime engel var mı; varsa sebebi.
 *
 * Eksik ücreti "—" ile doldurup göndermiyoruz: müşteriye "Aylık ücret —"
 * yazan bir mesaj gitmesi, hiç göndermemekten kötü. Kullanıcıya eksiği
 * söyleyip düzeltme şansı veriyoruz.
 */
export function hatirlatmaEngeli(tur: HatirlatmaTuru, deger: HatirlatmaDegerleri): string | null {
  const sablon = HATIRLATMA_SABLONLARI[tur];
  if (sablon.ucretGerekir && !deger.ucret?.trim()) {
    return "Bu ürünün aylık ücreti girilmemiş; onaylı şablon ücreti yazdığı için gönderilemez. Kurum aboneliğinden ücreti girin.";
  }
  const eksik = Object.entries(sablon.parametreler(deger))
    .filter(([, value]) => !String(value ?? "").trim())
    .map(([ad]) => ad);
  // Boş parametre Meta'da 132000'e yol açıyor; sebebini burada söylüyoruz.
  return eksik.length ? `Şablon için eksik bilgi: ${eksik.join(", ")}.` : null;
}
