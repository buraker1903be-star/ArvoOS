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

/*
  ÇOK PARA BİRİMLİ KATMAN (28.11.2026).

  Yukarısı TL dünyası ve öyle kalıyor: pazarlama sitesinin altı dili,
  JSON-LD ve llms.txt aynı `Fiyatlar` tablosunu okuyor, imzası
  değişmedi. Satış tarafı (konsol fiyatlandırması, abonelik, ödeme
  isteği) ise artık para birimini de taşımak zorunda.

  VARSAYILANLAR İKİ KAYNAKTAN: TRY tutarları pricing.ts'te, USD
  tutarları lib/site/doviz.ts'te zaten vardı — döviz listesi 28.10.2026'dan
  beri sitede gösteriliyordu ama konsoldan DEĞİŞTİRİLEMİYORDU. Artık
  ikisi de aynı kuralla çalışıyor: kod varsayılanı, veritabanı üstüne
  yazar. Böylece USD fiyatı da yayımlanabilir bir değer oluyor ve
  "sitede şu yazıyor ama satış başka" ayrışması kapanıyor.

  Anahtar `kod|BIRIM`: iki ayrı Map taşımaktansa tek tablo, çünkü
  çağıranların çoğu "şu planın şu birimdeki tutarı" diye soruyor.
*/
import { DOVIZ_FIYATLARI } from "./doviz-fiyatlari";
import { SATIS_PARA_BIRIMLERI, type ParaBirimi } from "../para";

export type CokParaliSatir = { kod: string; paraBirimi: ParaBirimi; aylikKurus: number | null };
/** Anahtar: `kod|BIRIM`. Değer: alt birim cinsinden tutar; null = teklif. */
export type CokParaliFiyatlar = Map<string, number | null>;

export const fiyatAnahtari = (kod: string, birim: ParaBirimi): string => `${kod}|${birim}`;

/** Kod varsayılanları (TRY: pricing.ts, USD: doviz.ts) + yayımlanmış satırlar. */
export function cokParaliBirlestir(yayimlanan: readonly CokParaliSatir[]): CokParaliFiyatlar {
  const sonuc: CokParaliFiyatlar = new Map();
  for (const plan of PLANS) {
    sonuc.set(fiyatAnahtari(plan.code, "TRY"), plan.aylikKurus);
    sonuc.set(fiyatAnahtari(plan.code, "USD"), DOVIZ_FIYATLARI[plan.code]?.USD ?? null);
  }
  for (const kalem of ADD_ONS) {
    sonuc.set(fiyatAnahtari(kalem.code, "TRY"), kalem.aylikKurus);
    sonuc.set(fiyatAnahtari(kalem.code, "USD"), DOVIZ_FIYATLARI[kalem.code]?.USD ?? null);
  }
  for (const satir of yayimlanan) {
    const anahtar = fiyatAnahtari(satir.kod, satir.paraBirimi);
    /* Tanınmayan kod yok sayılıyor (TL tarafındaki kuralın aynısı):
       veritabanında kalmış eski bir basamak kodu, kodda olmayan bir
       fiyatı ortaya çıkarmasın. */
    if (!sonuc.has(anahtar)) continue;
    sonuc.set(anahtar, satir.aylikKurus);
  }
  return sonuc;
}

/** Basamağın o birimdeki aylık tutarı; tanımsızsa null (= fiyat yok). */
export const birimliPlanTutari = (kod: string, birim: ParaBirimi, tablo: CokParaliFiyatlar): number | null =>
  tablo.get(fiyatAnahtari(kod, birim)) ?? null;

/** Yıllık bedel: aylığın tam katı — kural para biriminden bağımsız. */
export const birimliYillikTutar = (kod: string, birim: ParaBirimi, tablo: CokParaliFiyatlar): number | null => {
  const aylik = birimliPlanTutari(kod, birim, tablo);
  return aylik === null ? null : aylik * YILLIK_ODENEN_AY;
};

/**
 * Bir basamağın hangi birimlerde fiyatı var.
 *
 * "Teklif usulü" (null) fiyat SAYILMIYOR: USD satışını açma koşulu
 * "yayımlanmış USD fiyatı" ve teklif usulü bir basamakta rakam yok.
 */
export const fiyatliBirimler = (kod: string, tablo: CokParaliFiyatlar): ParaBirimi[] =>
  SATIS_PARA_BIRIMLERI.filter((birim) => birimliPlanTutari(kod, birim, tablo) !== null);
