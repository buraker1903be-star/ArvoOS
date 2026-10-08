/*
  CARİ ÖDEME BAĞLANTISI: müşteriye giden mesaj ve WhatsApp şablonunun düğme
  parçası. Saf modül (testi tests/unit/odeme-baglantisi.test.ts).

  Akış: müşteri ödeyeceği tutarı söyler → cari sayfasında tutar girilir →
  PayTR bağlantısı oluşur → WhatsApp ya da e-postayla gider. Eskiden bağlantı
  yalnızca bir taksite açılabiliyordu (Finans → PAYTR Tahsilatları) ve
  müşteriye wa.me/mailto ile personelin kendi hesabından gidiyordu.
*/

/** WhatsApp şablonunun adı (Meta'da onaylı olmalı; gövde değişkenleri isimli). */
export const ODEME_SABLONU = "odeme_baglantisi";

/** PayTR bağlantılarının tabanı; şablonun URL düğmesinde sabit duran kısım. */
export const PAYTR_LINK_TABANI = "https://www.paytr.com/link/";

const tl = (kurus: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 }).format(kurus / 100);

/** Tutar ekranda ve mesajda aynı biçimde: "₺5.000,00". */
export const odemeTutari = tl;

/*
  Şablonun dinamik URL düğmesine giden parça. Meta'da düğmenin tabanı sabit
  (PAYTR_LINK_TABANI), mesajla yalnızca sonu gider. Bağlantı bu tabanla
  başlamıyorsa (PayTR biçimi değişirse) null: yanlış adrese giden bir düğme
  göndermektense hata vermek doğru.
*/
export function paytrBaglantiParcasi(url: string): string | null {
  if (!url.startsWith(PAYTR_LINK_TABANI)) return null;
  const parca = url.slice(PAYTR_LINK_TABANI.length);
  return /^[A-Za-z0-9_-]+$/.test(parca) ? parca : null;
}

export function odemeBaglantisiMesaji(girdi: {
  kurum: string;
  musteri?: string | null;
  tutarKurus: number;
  aciklama?: string | null;
  url: string;
}) {
  const hitap = girdi.musteri?.trim() ? `Sayın ${girdi.musteri.trim()},` : "Sayın Yetkili,";
  const konu = girdi.aciklama?.trim() ? ` (${girdi.aciklama.trim()})` : "";
  const metin =
    `${hitap}\n\n${tl(girdi.tutarKurus)} tutarındaki ödemenizi${konu} aşağıdaki güvenli bağlantıdan kartla yapabilirsiniz:\n${girdi.url}\n\n` +
    `Ödemeniz hesabınıza otomatik işlenir.\n\nSaygılarımızla,\n${girdi.kurum}`;
  return { konu: `Ödeme bağlantınız — ${girdi.kurum}`, metin };
}
