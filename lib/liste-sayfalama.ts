/*
  LİSTE SAYFALAMASI — sayfa numarası ve son sayfa hesabı.

  Üç listede (teklifler, sözleşmeler, işler) aynı iki satır
  kopyalanıyordu. Kopya hesap, sayfa boyu bir listede değişince
  ötekilerde sessizce eski kalması demek; son sayfa hesabı da
  "toplam gelmezse ne olacak" sorusunu her yerde yeniden cevaplıyordu.

  Saf modül: birim testi tests/unit/liste-sayfalama.test.ts.
*/

/** Listelerin ortak sayfa boyu. */
export const SAYFA_BOYU = 50;

/**
 * Adresteki ?sayfa= değeri. Bozuk, eksi ya da sıfır değer ilk sayfaya
 * düşüyor: "?sayfa=abc" ile gelen bağlantı hata vermemeli.
 */
export function sayfaNumarasi(ham: string | undefined): number {
  return Math.max(1, Number.parseInt(ham ?? "1", 10) || 1);
}

/**
 * Son sayfa. Toplam sayı varsa ondan; yoksa (sayım istenmediyse ya da
 * dönmediyse) dolu bir sayfa "devamı var" sayılıyor — eksik bir
 * "Sonraki" düğmesi, kullanıcıyı kayıtların bittiğine inandırır.
 */
export function sonSayfaNo(toplam: number | null | undefined, satirSayisi: number, sayfaNo: number, boyut = SAYFA_BOYU): number {
  if (typeof toplam === "number") return Math.max(1, Math.ceil(toplam / boyut));
  return satirSayisi === boyut ? sayfaNo + 1 : sayfaNo;
}

/** Sorguya verilecek aralık: [başlangıç, bitiş] (PostgREST range). */
export function sayfaAraligi(sayfaNo: number, boyut = SAYFA_BOYU): [number, number] {
  return [(sayfaNo - 1) * boyut, sayfaNo * boyut - 1];
}
