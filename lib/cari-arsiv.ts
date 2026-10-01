/*
  CARİ ARŞİVİ — BAKİYESİ KAPANAN CARİ KENDİLİĞİNDEN ARŞİVE DÜŞER.

  Arşiv SAKLANAN bir bayrak değil, bakiyeden TÜRETİLİR. Bunun nedeni
  bakiyenin kendisinin de saklanmaması: borç, sözleşme tutarı ile defter
  kayıtlarından her seferinde hesaplanıyor (lib ../app/panel/finance/
  account-balances.ts). Ayrıca bir "arşivlendi" sütunu tutsaydık, ek
  hizmet eklendiğinde ya da iade girildiğinde o sütunu güncellemeyi
  unutan her yol sessizce yanlış listeye düşürürdü. Türetilmiş kural
  kendi kendini düzeltir: arşivdeki cariye ek hizmet girildiği anda
  bakiye açılır ve cari aktif listeye geri döner.

  Üç durum var; "hareketsiz" ayrı tutuluyor çünkü bakiyesi sıfır olmakla
  borcu kapanmış olmak aynı şey değil: hiç hareketi olmayan yeni cari de
  sıfır bakiyelidir, ama o kapanmadı — henüz başlamadı. Onu arşive
  atmak, yeni açılan cariyi gözden kaybettirirdi.
*/

export type CariDurum = "acik" | "arsiv" | "hareketsiz";

export type BakiyeliCari = {
  debt: number;
  collections: number;
  refunds: number;
  balance: number;
};

export function cariDurumu(cari: BakiyeliCari): CariDurum {
  if (cari.balance > 0) return "acik";
  // Borç ya da tahsilat görmüş ve bakiyesi sıfırlanmışsa: kapandı.
  if (cari.debt > 0 || cari.collections > 0 || cari.refunds > 0) return "arsiv";
  return "hareketsiz";
}

/*
  Listeyi ikiye ayırır. Sıralama korunur: çağıran taraf zaten ada göre
  sıralı veri gönderiyor, bölme bunu bozmamalı.
*/
export function cariBolumle<T extends BakiyeliCari>(cariler: T[]): { aktif: T[]; arsiv: T[] } {
  const aktif: T[] = [];
  const arsiv: T[] = [];
  for (const cari of cariler) (cariDurumu(cari) === "arsiv" ? arsiv : aktif).push(cari);
  return { aktif, arsiv };
}
