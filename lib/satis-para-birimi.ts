/*
  SATIŞ PARA BİRİMİ KARARI (28.11.2026) — saf kural, veri okumaz.

  "ArvoLab USD'ye geçsin" tek bir bayrak değil: bir ürünün bir para
  biriminde satılabilmesi İKİ şartın birlikte sağlanmasına bağlı.

   1. O planın O birimde YAYIMLANMIŞ fiyatı var mı? Teklif usulü
      basamakta rakam yok, yani şart sağlanmıyor.
   2. O birimde çalışan, DOĞRULANMIŞ bir tahsilat kanalı var mı?
      Fiyatı dolar yazıp parayı lirada çekmek, müşteriye söylenmeyen
      bir kur uygulamaktır.

  İkisi de sağlanmıyorsa birim SATILAMAZ ve ekran bunu sebebiyle
  gösterir. Sessizce TRY'ye düşmek yasak (kurum sahibinin açık
  talimatı): müşteri USD seçtiyse ya USD ile satılır ya da neden
  satılamadığı yazılır.

  KANAL DOĞRULAMASI DIŞARIDAN GELİYOR. Bu modül "PayTR USD destekliyor
  mu" diye bilmez; çağıran kanalların durumunu verir, burada yalnızca
  karar birleştirilir. Bugün USD kart ve USD otomatik yenileme
  KAPALI: PayTR hesabında USD işlem ve mutabakat doğrulanmadı
  (docs/para-birimi-haritasi.md).
*/
import { SATIS_PARA_BIRIMLERI, VARSAYILAN_PARA_BIRIMI, type ParaBirimi } from "./para";

export const KANALLAR = ["havale", "kart", "otomatik_yenileme"] as const;
export type Kanal = (typeof KANALLAR)[number];

export const KANAL_ADI: Record<Kanal, string> = {
  havale: "Havale/EFT",
  kart: "Kart",
  otomatik_yenileme: "Otomatik yenileme",
};

export type KanalDurumu = {
  kanal: Kanal;
  kullanilabilir: boolean;
  /** Kullanılamıyorsa TEK CÜMLE sebep; ekranda olduğu gibi gösteriliyor. */
  neden: string | null;
};

export type BirimDurumu = {
  paraBirimi: ParaBirimi;
  /** O birimde yayımlanmış bir rakam var mı (teklif usulü sayılmaz). */
  fiyatVar: boolean;
  kanallar: KanalDurumu[];
  /** Fiyat + en az bir kanal. */
  satilabilir: boolean;
  /** Satılamıyorsa sebep; satılabiliyorsa null. */
  neden: string | null;
};

export type KanalGirdisi = {
  /** Birimde aktif ve doğrulanmış havale hesabı var mı. */
  havaleHesabiVar: boolean;
  /** PayTR hesabında o birimde kart tahsilatı doğrulandı mı. */
  kartDogrulandi: boolean;
};

/**
 * Bir para biriminin kanal durumu.
 *
 * Otomatik yenileme karttan geçiyor: kart kapalıysa yenileme de kapalı
 * (kayıtlı karttan çekim aynı uçtan yapılıyor).
 */
export function kanalDurumlari(birim: ParaBirimi, girdi: KanalGirdisi): KanalDurumu[] {
  const kartNedeni = girdi.kartDogrulandi
    ? null
    : `${birim} kart tahsilatı PayTR hesabında doğrulanmadı; kanal kapalı.`;
  return [
    {
      kanal: "havale",
      kullanilabilir: girdi.havaleHesabiVar,
      neden: girdi.havaleHesabiVar ? null : `${birim} havale için doğrulanmış banka hesabı tanımlı değil.`,
    },
    { kanal: "kart", kullanilabilir: girdi.kartDogrulandi, neden: kartNedeni },
    { kanal: "otomatik_yenileme", kullanilabilir: girdi.kartDogrulandi, neden: kartNedeni },
  ];
}

/** Bir birimin satılabilirliği: fiyat + en az bir açık kanal. */
export function birimDurumu(birim: ParaBirimi, fiyatVar: boolean, kanallar: KanalDurumu[]): BirimDurumu {
  const acikKanal = kanallar.some((k) => k.kullanilabilir);
  const neden = !fiyatVar && !acikKanal
    ? `${birim} fiyatı yayımlanmadı ve ${birim} tahsilat kanalı yok.`
    : !fiyatVar
      ? `${birim} fiyatı yayımlanmadı.`
      : !acikKanal
        ? `${birim} tahsilat kanalı yok: ${kanallar.map((k) => k.neden).filter(Boolean).join(" ")}`
        : null;
  return { paraBirimi: birim, fiyatVar, kanallar, satilabilir: fiyatVar && acikKanal, neden };
}

export type UrunGirdisi = {
  /** Ürün kodu (pricing.ts → PricedProduct). */
  urun: string;
  /** Birim başına: o üründe yayımlanmış rakamı olan plan var mı. */
  fiyatliBirimler: readonly ParaBirimi[];
  /** Birim başına kanal girdisi. */
  kanal: Record<ParaBirimi, KanalGirdisi>;
  /**
   * Yöneticinin USD satışını açtığı ürünler. ArvoLab bu listede
   * olmasa da koşullar sağlanınca USD'ye geçiyor (iş kararı,
   * 28.11.2026); öteki ürünlerde anahtar gerekiyor.
   */
  usdAcik: boolean;
  /** USD'yi koşullar sağlanınca VARSAYILAN yapan ürün. */
  usdVarsayilanAday: boolean;
};

export type UrunParaDurumu = {
  urun: string;
  birimler: BirimDurumu[];
  /** Yeni satışta önerilen birim. */
  varsayilan: ParaBirimi;
  /** Varsayılanın neden o olduğu; ekranda açıklama olarak gösteriliyor. */
  varsayilanNedeni: string;
};

/**
 * Ürünün para birimi durumu ve yeni satışların varsayılanı.
 *
 * VARSAYILAN DEĞİŞTİRME KURALI: USD ancak (a) ürün aday ya da yönetici
 * açmış, (b) USD fiyatı yayımlanmış ve (c) USD kanalı doğrulanmışsa
 * varsayılan olur. Biri eksikse varsayılan TRY kalır ve sebebi
 * yazılır — "USD'ye geçtik" diye duyurulup TL çekmek en kötüsü.
 */
export function urunParaDurumu(girdi: UrunGirdisi): UrunParaDurumu {
  const birimler = SATIS_PARA_BIRIMLERI.map((birim) =>
    birimDurumu(birim, girdi.fiyatliBirimler.includes(birim), kanalDurumlari(birim, girdi.kanal[birim])),
  );
  const usd = birimler.find((b) => b.paraBirimi === "USD")!;
  const usdIstendi = girdi.usdVarsayilanAday || girdi.usdAcik;

  if (usdIstendi && usd.satilabilir) {
    return {
      urun: girdi.urun,
      birimler,
      varsayilan: "USD",
      varsayilanNedeni: girdi.usdVarsayilanAday
        ? "USD fiyatı yayımlandı ve USD tahsilat kanalı doğrulandı."
        : "Yönetici bu ürün için USD satışını açtı; fiyat ve kanal hazır.",
    };
  }
  return {
    urun: girdi.urun,
    birimler,
    varsayilan: VARSAYILAN_PARA_BIRIMI,
    varsayilanNedeni: usdIstendi
      ? `USD varsayılan olamadı: ${usd.neden ?? "koşullar sağlanmadı."}`
      : "Bu ürün için USD satışı açılmadı.",
  };
}

/**
 * Müşterinin AÇIKÇA seçtiği birim satılabilir mi?
 *
 * Sessiz düşüş yok: seçim karşılanamıyorsa işlem TRY'ye çevrilmiyor,
 * sebep döndürülüyor ve çağıran onu gösteriyor.
 */
export function secimKarsilanabilir(
  durum: UrunParaDurumu,
  secilen: ParaBirimi,
): { uygun: true } | { uygun: false; neden: string } {
  const birim = durum.birimler.find((b) => b.paraBirimi === secilen);
  if (!birim) return { uygun: false, neden: `${secilen} satış para birimi değil.` };
  return birim.satilabilir ? { uygun: true } : { uygun: false, neden: birim.neden ?? `${secilen} ile satış yapılamıyor.` };
}

/** Bir birimde kullanılabilir kanallar; ödeme ekranı bunları çiziyor. */
export const acikKanallar = (durum: UrunParaDurumu, birim: ParaBirimi): Kanal[] =>
  (durum.birimler.find((b) => b.paraBirimi === birim)?.kanallar ?? []).filter((k) => k.kullanilabilir).map((k) => k.kanal);
