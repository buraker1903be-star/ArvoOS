/*
  Yayımlanmış fiyatın ÇÖZÜMÜ: kod varsayılan, veritabanı üstüne yazar.

  lib/site/pricing.ts tek kaynak olmaya devam ediyor — basamakların
  kendisi, kodları, birimi ve hangi basamağın teklif usulü olduğu orada.
  Veritabanı yalnızca TUTARI geçersiz kılıyor.

  Neden böyle, tersi değil:
   - Veritabanı okunamazsa site fiyatsız kalmıyor. Yayımlanmış bir fiyat
     listesinde boş hücre, yanlış rakamdan da kötüdür.
   - Yeni bir basamak eklemek hâlâ koddan geçiyor; iki dilin aynı
     basamakları gösterdiğini sabitleyen testler yaşıyor.
   - Yalnızca YAYIMLANMIŞ satır okunuyor (RLS de aynı kuralı uyguluyor):
     hazırlanan zam yayımlanmadan dışarıya sızmıyor.

  Saf değil (veritabanına dokunuyor); kuralın saf kısmı `fiyatlariBirlestir`
  ve birim testi tests/unit/fiyat-kaynagi.test.ts.
*/
import { ADD_ONS, PLANS } from "./pricing";

export type FiyatSatiri = { kod: string; aylikKurus: number | null };

/**
 * Koddaki varsayılanların üstüne yayımlanmış tutarları yazar.
 *
 * Tanınmayan kod YOK SAYILIR: veritabanında kalmış eski bir basamak
 * kodu, kodda olmayan bir fiyatı ortaya çıkarmamalı.
 */
export function fiyatlariBirlestir(yayimlanan: FiyatSatiri[]): Map<string, number | null> {
  const sonuc = new Map<string, number | null>();
  for (const plan of PLANS) sonuc.set(plan.code, plan.aylikKurus);
  for (const kalem of ADD_ONS) sonuc.set(kalem.code, kalem.aylikKurus);
  for (const satir of yayimlanan) {
    if (!sonuc.has(satir.kod)) continue;
    sonuc.set(satir.kod, satir.aylikKurus);
  }
  return sonuc;
}

/** Çözülmüş tutarı okur; kod bilinmiyorsa null. */
export const cozulmusTutar = (fiyatlar: Map<string, number | null>, kod: string): number | null =>
  fiyatlar.get(kod) ?? null;
