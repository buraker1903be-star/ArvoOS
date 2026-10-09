/*
  TOPLU POSTA İŞLEMLERİNİN SAF KISMI.

  Her yazışma için ayrı bir Gmail çağrısı var (toplu uç yok), o yüzden
  seçimin bir sınırı var. Sınır SÖYLENEREK kesiliyor: sessizce ilk
  ellisini işlemek, kullanıcının işlendiğini sandığı yazışmaları geride
  bırakırdı.
*/

export const TOPLU_SINIR = 50;

/**
 * Formdan gelen seçim: boşluklar atılır, yinelenenler tekilleşir.
 *
 * Yineleme gerçek bir durum: "tümünü seç" kutucuğu ile tek tek işaretleme
 * aynı alanı iki kez gönderebiliyor ve aynı yazışmaya iki Gmail çağrısı
 * gidiyordu.
 */
export function topluSecim(degerler: readonly (string | null | undefined)[]): string[] {
  const temiz = degerler.map((deger) => String(deger ?? "").trim()).filter(Boolean);
  const tekil = [...new Set(temiz)];
  if (!tekil.length) throw new Error("Önce yazışma seçin.");
  if (tekil.length > TOPLU_SINIR) {
    throw new Error(`Tek seferde en fazla ${TOPLU_SINIR} yazışma işlenebiliyor; ${tekil.length} seçtiniz.`);
  }
  return tekil;
}

/**
 * Toplu işlemin sonucunu kullanıcıya anlatan metin.
 *
 * Bir yazışmada Gmail hata verince ötekiler yarıda kalmıyor; sonunda
 * kaçının olduğu ve kaçının olmadığı yazılıyor. Yarısı işlenmiş bir
 * seçimi "başarısız" diye göstermek, kullanıcıya işlemi yeniden
 * yaptırırdı.
 */
export function topluSonucMetni(girdi: { toplam: number; olan: number; hatalar: readonly string[]; basarili: (adet: number) => string }):
  { tur: "basari" | "uyari"; metin: string } {
  if (!girdi.hatalar.length) return { tur: "basari", metin: girdi.basarili(girdi.olan) };
  return {
    tur: "uyari",
    metin: `${girdi.toplam} yazışmadan ${girdi.olan} tanesi işlendi; ${girdi.hatalar.length} tanesi olmadı: ${girdi.hatalar[0]}`,
  };
}
