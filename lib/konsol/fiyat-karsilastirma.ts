/*
  FİYATLAR — ÜRÜNLER ARASI KARŞILAŞTIRMA (27.11.2026) — saf kural.

  Sol menüdeki "Fiyatlar" hedefi: yöneticinin işi burada tek bir ürünü
  düzenlemek değil, DÖRT ÜRÜNÜN planlarını aynı yerde görmek. Ekran
  14.10.2026'dan beri tek ürün açıyordu (?urun=arvoos) ve "ArvoLab'ın
  Başlangıç'ı ArvoARC'ınkinin kaç katı" sorusu sekme sekme dolaşarak
  cevaplanıyordu.

  AYNI PLANIN İKİ DÖNEMİ AYRI SATIR. "Aylık 2.390 / yıllık 23.900" tek
  hücreye sıkıştırıldığında hangi tutarın hangi döneme ait olduğu
  süzgeçten sonra okunamıyordu; faturalama dönemi bir SÜZGEÇ olduğuna
  göre satırın kendi alanı olmalı.

  Yıllık satır yalnızca yıllık tutarı OLAN planda çiziliyor: teklif
  usulü planın (aylikKurus = null) yıllığı da yok ve "—" yazan bir
  satır eklemek listeyi uzatmaktan başka bir şey yapmıyor.

  DURUM ÜÇ HÂLDEN BİRİ, hepsi fiyat kaydından:
    yayimli  — tutar konsoldan yayımlanmış
    koddan   — henüz yayımlanmamış, koddaki değer geçerli
    bekliyor — taslak var, yayım bekliyor
  "bekliyor" ötekilerin üstünde: yayımlı bir satırın bekleyen taslağı
  varsa yöneticinin görmesi gereken şey bekleyen değişikliktir.

  Birim testi: tests/unit/fiyat-karsilastirma.test.ts.
*/

export type FaturaDonemi = "aylik" | "yillik";
export type FiyatDurumu = "yayimli" | "koddan" | "bekliyor";

export const FATURA_DONEMLERI: { kod: FaturaDonemi; ad: string }[] = [
  { kod: "aylik", ad: "Aylık" },
  { kod: "yillik", ad: "Yıllık" },
];

export const FIYAT_DURUMLARI: { kod: FiyatDurumu; ad: string }[] = [
  { kod: "yayimli", ad: "Konsoldan yayımlı" },
  { kod: "koddan", ad: "Koddaki değer" },
  { kod: "bekliyor", ad: "Yayım bekliyor" },
];

/** Girdi planı: ürün kodu, plan kodu, adı ve birimi. */
export type KarsilastirmaPlani = {
  urun: string;
  urunAdi: string;
  kod: string;
  ad: string;
  birim: string;
  /** Yayındaki aylık tutar (kuruş); null = teklif usulü. */
  aylik: number | null;
  /** Yayındaki yıllık tutar (kuruş); null = yok ya da teklif. */
  yillik: number | null;
  /** Fiyat kaydı: yayımlanmış mı, bekleyen taslağı var mı. */
  yayimli: boolean;
  bekleyen: boolean;
};

export type KarsilastirmaSatiri = {
  anahtar: string;
  urun: string;
  urunAdi: string;
  planKodu: string;
  planAdi: string;
  birim: string;
  donem: FaturaDonemi;
  donemAdi: string;
  /** Tutar (kuruş); null = teklif usulü. */
  tutar: number | null;
  durum: FiyatDurumu;
  durumAdi: string;
};

export type Suzgec = {
  urun?: string;
  donem?: string;
  durum?: string;
};

const DURUM_ADI: Record<FiyatDurumu, string> = {
  yayimli: "Konsoldan yayımlı",
  koddan: "Koddaki değer",
  bekliyor: "Yayım bekliyor",
};

/** Süzgeç değeri bilinen bir koda mı denk geliyor; değilse "hepsi". */
export const faturaDonemi = (ham: string | undefined): FaturaDonemi | null =>
  FATURA_DONEMLERI.some((d) => d.kod === ham) ? (ham as FaturaDonemi) : null;
export const fiyatDurumu = (ham: string | undefined): FiyatDurumu | null =>
  FIYAT_DURUMLARI.some((d) => d.kod === ham) ? (ham as FiyatDurumu) : null;

/** Plan listesinden karşılaştırma satırları; süzgeç uygulanmış. */
export function karsilastirmaSatirlari(planlar: KarsilastirmaPlani[], suzgec: Suzgec = {}): KarsilastirmaSatiri[] {
  const donemSuzgeci = faturaDonemi(suzgec.donem);
  const durumSuzgeci = fiyatDurumu(suzgec.durum);
  const urunSuzgeci = suzgec.urun && suzgec.urun !== "tumu" ? suzgec.urun : null;

  const satirlar: KarsilastirmaSatiri[] = [];
  for (const plan of planlar) {
    if (urunSuzgeci && plan.urun !== urunSuzgeci) continue;
    /* Bekleyen taslak ötekilerin üstünde: yöneticinin görmesi gereken
       şey yayımlanmış tutar değil, yayım bekleyen değişikliktir. */
    const durum: FiyatDurumu = plan.bekleyen ? "bekliyor" : plan.yayimli ? "yayimli" : "koddan";
    if (durumSuzgeci && durum !== durumSuzgeci) continue;
    const ortak = {
      urun: plan.urun, urunAdi: plan.urunAdi, planKodu: plan.kod, planAdi: plan.ad, birim: plan.birim,
      durum, durumAdi: DURUM_ADI[durum],
    };
    if (!donemSuzgeci || donemSuzgeci === "aylik") {
      satirlar.push({ ...ortak, anahtar: `${plan.kod}-aylik`, donem: "aylik", donemAdi: "Aylık", tutar: plan.aylik });
    }
    /* Yıllığı olmayan planın yıllık satırı yok: "—" yazan bir satır
       listeyi uzatmaktan başka bir şey yapmıyor. */
    if ((!donemSuzgeci || donemSuzgeci === "yillik") && plan.yillik !== null) {
      satirlar.push({ ...ortak, anahtar: `${plan.kod}-yillik`, donem: "yillik", donemAdi: "Yıllık", tutar: plan.yillik });
    }
  }
  return satirlar;
}

/** Süzgeçlerden herhangi biri etkin mi (boş sonucu doğru anlatmak için). */
export const suzgecVarMi = (suzgec: Suzgec): boolean =>
  Boolean((suzgec.urun && suzgec.urun !== "tumu") || faturaDonemi(suzgec.donem) || fiyatDurumu(suzgec.durum));
