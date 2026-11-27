/*
  ÜRÜN DETAYI — "İŞLEM BEKLEYENLER" KARTININ KURALI (27.11.2026) — saf.

  Kart 26.11.2026'ya kadar üç sabit kısayoldu ve hiç sayı yazmıyordu:
  "bu üründe bugün ne bekliyor" sorusuna cevap vermiyordu. Mockup sayı
  istiyor; sayı yazacaksak kaynağı da ürünün KENDİ kaydı olmalı.

  ÜÇ KURAL:
    1. Sayısı SIFIR olan satır hiç çizilmez — "0 müşteri" diye bir iş yok.
    2. Sayısı OKUNAMAYAN satır sayısız çizilir: uydurma bir sayı yerine
       yalnızca yol gösterilir. ("okunamadı" ile "yok" aynı şey değil.)
    3. Kaynağı olmayan bir iş hiç eklenmez. Destek talepleri kuruma
       bağlı (support_tickets'ta product sütunu yok), bu yüzden burada
       "yanıt bekleyen talep" satırı YOK — ürün başına sayı üretmek,
       ölçülmemiş bir şeyi ölçülmüş göstermek olurdu.

  Eşikler ürün kararı: yenileme 14 gün, deneme 3 gün. İkisi de ileri
  bakıyor; GEÇMİŞ tarihli kayıt sayılmıyor, çünkü o artık "yaklaşan"
  değil, olmuş bir şey.

  Birim testi: tests/unit/urun-bekleyenler.test.ts.
*/

/** Ödeyen sayılan lisans durumları (ürün detayıyla aynı küme). */
const ODEYEN = new Set(["active", "past_due"]);

export const YENILEME_ESIGI_GUN = 14;
export const DENEME_ESIGI_GUN = 3;

export type BekleyenLisans = {
  /** Lisans durumu (active, trialing, past_due…). */
  durum: string;
  /** Dönem sonu (ISO) — yenileme bu tarihe bakıyor. */
  donemSonu: string | null;
  /** Deneme bitişi (ISO). */
  denemeSonu: string | null;
};

export type BekleyenAbone = { status: string; trial_ends_at: string | null };

export type BekleyenIs = {
  anahtar: string;
  baslik: string;
  alt?: string;
  href: string;
  eylem: string;
};

export type BekleyenGirdi = {
  urunKodu: string;
  /** Ürün kapsamındaki lisanslar. */
  lisanslar: BekleyenLisans[];
  /** Ürünün bireysel aboneleri; yoksa boş. */
  aboneler: BekleyenAbone[];
  /**
   * Onay bekleyen ödeme sayısı. null = OKUNAMADI (sayısız satır),
   * 0 = gerçekten yok (satır hiç çizilmez).
   */
  bekleyenOdeme: number | null;
  simdi: Date;
  /** Sayıyı ekranda yazacak biçimlendirici (Türkçe binlik ayırıcı). */
  sayi: (n: number) => string;
};

/** Tarih ileride ve en çok `gun` gün sonra mı? */
function yaklasiyorMu(ham: string | null, simdi: number, gun: number): boolean {
  if (!ham) return false;
  const an = Date.parse(ham);
  if (Number.isNaN(an)) return false;
  return an >= simdi && an <= simdi + gun * 86400000;
}

export function urunBekleyenleri({ urunKodu, lisanslar, aboneler, bekleyenOdeme, simdi, sayi }: BekleyenGirdi): BekleyenIs[] {
  const an = simdi.getTime();
  const musteri = (n: number) => `${sayi(n)} müşteri`;
  const musteriAdresi = `/panel/platform/musteriler?urun=${urunKodu}`;

  const yaklasanYenileme = lisanslar.filter(
    (l) => ODEYEN.has(l.durum) && yaklasiyorMu(l.donemSonu, an, YENILEME_ESIGI_GUN)).length;
  const bitenDeneme =
    lisanslar.filter((l) => l.durum === "trialing" && yaklasiyorMu(l.denemeSonu, an, DENEME_ESIGI_GUN)).length
    + aboneler.filter((a) => a.status === "trialing" && yaklasiyorMu(a.trial_ends_at, an, DENEME_ESIGI_GUN)).length;

  const isler: BekleyenIs[] = [];
  if (bekleyenOdeme === null) {
    isler.push({
      anahtar: "odeme",
      baslik: "Ödeme bildirimleri",
      alt: "Sayı okunamadı; kuyruk Ödeme onaylarında",
      href: "/panel/platform/payments",
      eylem: "İncele",
    });
  } else if (bekleyenOdeme > 0) {
    isler.push({
      anahtar: "odeme",
      baslik: "Onay bekleyen ödeme",
      alt: `${musteri(bekleyenOdeme)} · dekont ya da kart ödemesi onay bekliyor`,
      href: "/panel/platform/payments",
      eylem: "İncele",
    });
  }
  if (yaklasanYenileme > 0) {
    isler.push({
      anahtar: "yenileme",
      baslik: "Yaklaşan yenileme",
      alt: `${musteri(yaklasanYenileme)} · dönemi ${YENILEME_ESIGI_GUN} gün içinde doluyor`,
      href: musteriAdresi,
      eylem: "Görüntüle",
    });
  }
  if (bitenDeneme > 0) {
    isler.push({
      anahtar: "deneme",
      baslik: "Deneme süresi bitmek üzere",
      alt: `${musteri(bitenDeneme)} · son ${DENEME_ESIGI_GUN} gün içinde sona erecek`,
      href: musteriAdresi,
      eylem: "Görüntüle",
    });
  }
  return isler;
}
