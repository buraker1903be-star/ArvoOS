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
import { ADD_ONS, PLANS, YILLIK_ODENEN_AY, type Plan } from "./pricing";

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

/** Çözülmüş fiyat tablosu; anahtar plan ya da ek kalem kodu. */
export type Fiyatlar = Map<string, number | null>;

/**
 * Basamağın geçerli aylık tutarı.
 *
 * Tablo verilmezse koddaki değer kullanılıyor: ücretler sayfası
 * veritabanına ulaşamadığında da fiyat gösteriyor.
 */
export const planTutari = (plan: Plan, fiyatlar?: Fiyatlar): number | null =>
  fiyatlar?.has(plan.code) ? fiyatlar.get(plan.code) ?? null : plan.aylikKurus;

/** Yıllık bedel: aylığın tam katı, bölme ve yuvarlama yok. */
export const planYillikTutari = (plan: Plan, fiyatlar?: Fiyatlar): number | null => {
  const aylik = planTutari(plan, fiyatlar);
  return aylik === null ? null : aylik * YILLIK_ODENEN_AY;
};

/** Ek kalemin geçerli aylık tutarı. */
export const ekKalemTutari = (kod: string, fiyatlar?: Fiyatlar): number | null => {
  if (fiyatlar?.has(kod)) return fiyatlar.get(kod) ?? null;
  return ADD_ONS.find((kalem) => kalem.code === kod)?.aylikKurus ?? null;
};
