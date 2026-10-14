/*
  ArvoOS PAKET LİMİTLERİ — panelin tek kopyası.

  Veritabanındaki private.default_license_limits (20261013191844) yeni
  kiracının lisansına bu değerleri yazıyor; lisans formu "varsayılanı
  uygula" kısayolunda, konsolun Ücret ve Paketler ekranı da gösterimde
  bunları kullanıyor. Eskiden bu tablo lisans formunun içindeydi ve SQL
  ile elle eşit tutuluyordu: 13.10.2026'da SQL 3/15'e inmiş, form 5/25'te
  kalmıştı. İki tarafın eşitliğini tests/db/paket-limitleri.test.mjs
  sabitliyor (veritabanı işlevini çağırıp buradaki değerle karşılaştırıyor).

  Saf modül; yalnızca silinebilir tür ek açıklamaları var (Node tür
  ayıklamasıyla doğrudan içe aktarılabiliyor).
*/
export type PaketLimiti = { userLimit: number; storageLimitMb: number; aiCreditLimit: number };

export const PAKET_VARSAYILANI: Record<string, PaketLimiti> = {
  starter: { userLimit: 3, storageLimitMb: 5120, aiCreditLimit: 500 },
  professional: { userLimit: 15, storageLimitMb: 51200, aiCreditLimit: 2500 },
  enterprise: { userLimit: 250, storageLimitMb: 512000, aiCreditLimit: 10000 },
};

/*
  PAKETİYLE UYUŞMAYAN LİSANS (14.10.2026).

  Sapma yalnızca lisans formunun içinde, SEÇİLİ kiracı için görünüyordu:
  "hangi kiracı paketinden fazlasını alıyor" sorusunun yanıtı hiçbir
  ekranda yoktu ve kurucu kiracıları tek tek açmadıkça göremiyordu.
  Kota aşımında aynı boşluk vardı ve 12.10.2026'da kapatılmıştı; bu onun
  kardeşi — orada müşteri hakkından fazlasını KULLANIYOR, burada
  hakkından fazlası TANIMLANMIŞ.

  Sapma HATA DEĞİL: pazarlıkla genişletilmiş limitler var ve grup
  markalarının limiti bilerek yüksek. Ekran yalnızca "Başlangıç paketi 3
  kullanıcı, bu kiracıda 250" diye yazıyor; bilerek mi öyle olduğunu
  kurucu bilir. Ama ücretli bir pakette sessiz sapma, satılmamış koltuğu
  bedava vermek demek.
*/
export type LimitSapmasi = { alan: "kullanıcı" | "depolama" | "AI kredisi"; paket: number; kiraci: number };

export function limitSapmalari(
  planCode: string | null | undefined,
  lisans: { userLimit: number | null; storageLimitMb: number | null; aiCreditLimit: number | null },
): LimitSapmasi[] {
  const varsayilan = PAKET_VARSAYILANI[String(planCode ?? "").trim()];
  /* Tanınmayan paket kıyaslanmıyor: karşılaştıracak bir varsayılan yok
     ve "sapma var" demek yanlış olurdu. */
  if (!varsayilan) return [];
  const olc = (alan: LimitSapmasi["alan"], paket: number, kiraci: number | null): LimitSapmasi | null =>
    kiraci === null || Math.round(kiraci) === paket ? null : { alan, paket, kiraci: Math.round(kiraci) };
  return [
    olc("kullanıcı", varsayilan.userLimit, lisans.userLimit),
    olc("depolama", varsayilan.storageLimitMb, lisans.storageLimitMb),
    olc("AI kredisi", varsayilan.aiCreditLimit, lisans.aiCreditLimit),
  ].filter((x): x is LimitSapmasi => x !== null);
}

/** Yalnızca kiracıya FAZLA verilen sapmalar: satılmamış hak. */
export const fazlaVerilen = (sapmalar: readonly LimitSapmasi[]): LimitSapmasi[] =>
  sapmalar.filter((s) => s.kiraci > s.paket);
