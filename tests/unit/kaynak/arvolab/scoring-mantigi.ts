/*
  ArvoLab app/actions/scoring.ts — HESAP VE DOĞRULAMA PARÇALARININ AKTARIMI.

  Kaynak: ArvoLab main b62bfcf698e680b73810cf747cc7355020f95b72,
  app/actions/scoring.ts (git blob d51e7a22cceeec428ab99e2617d99bc812ae29a0).

  Dosyanın tamamı buraya alınamıyor: sunucu işlemi Supabase'e, oturuma ve
  "use server"a bağlı. Alınan yalnızca hesap ve doğrulama satırları; her
  parçanın kaynaktaki satır aralığı yanında yazılı ve gövdeler satırı
  satırına aynı. Yalnızca veritabanı okuması bir parametreye çevrildi
  (mevcut kayıt ve kriter satırı çağırandan geliyor) ve `return { error }`
  biçimi korunarak dönüşler sadeleşti. FormData, Node'un yerleşik
  FormData'sı; kaynak da onu okuyordu.

  Bu dosya ÜRETİMDE KULLANILMAZ. Eşdeğerlik testinin (docentlik-esdegerlik)
  referansıdır: ArvoOS çekirdeği (lib/docentlik/) bunun verdiği sonucu
  vermek zorunda. Kaynak değişirse burası elle yenilenir; o zaman eşdeğerlik
  testi farkı gösterir.
*/

import { korunanBirimPuan, paylasimKatsayisi, puanHesapla } from "./docentlik-puan";

// scoring.ts:55-57
function parseDecimal(raw: string) {
  return Number(raw.trim().replace(",", "."));
}

// scoring.ts:59-66
/* Boş = tanımsız (null). Doluysa 0'dan büyük, en fazla 1. */
export function katsayiOku(raw: FormDataEntryValue | null): { deger: number | null } | { hata: string } {
  const metin = String(raw ?? "").trim();
  if (!metin) return { deger: null };
  const sayi = parseDecimal(metin);
  if (!Number.isFinite(sayi) || sayi <= 0 || sayi > 1) return { hata: "Yazar katsayısı 0 ile 1 arasında olmalı (örn. 0,8); paylaşım yoksa boş bırakın." };
  return { deger: sayi };
}

// scoring.ts:68-76
/* Faaliyetin yazar bilgisi ve tarihi formdan. Tarih boş olabilir. */
export function faaliyetAyrintisi(formData: FormData): { yazarSayisi: number; baslica: boolean; tarih: string | null } | { hata: string } {
  const yazarRaw = String(formData.get("yazarSayisi") ?? "1").trim() || "1";
  const yazarSayisi = Number(yazarRaw);
  if (!Number.isInteger(yazarSayisi) || yazarSayisi < 1 || yazarSayisi > 500) return { hata: "Yazar sayısı 1 ile 500 arasında bir tam sayı olmalı." };
  const tarih = String(formData.get("faaliyetTarihi") ?? "").trim() || null;
  if (tarih && !/^\d{4}-\d{2}-\d{2}$/.test(tarih)) return { hata: "Tarih geçersiz." };
  return { yazarSayisi, baslica: yazarSayisi === 1 || String(formData.get("baslicaYazar") ?? "evet") === "evet", tarih };
}

type Kriter = { points_per_unit: number; baslica_yazar_katsayisi?: number | null; diger_yazar_katsayisi?: number | null; esit_bolusum?: boolean | null };

// createCriterion, scoring.ts:110-117 (kod/etiket alanları dışarıda bırakıldı)
export function kriterPuaniEkleme(formData: FormData): { points: number } | { error: string } {
  const pointsRaw = String(formData.get("pointsPerUnit") ?? "").trim();
  if (!pointsRaw) return { error: "Kod, etiket ve puan alanları zorunludur." };
  const points = parseDecimal(pointsRaw);
  if (!Number.isFinite(points) || points < 0) {
    return { error: "Birim başına puan 0 veya daha büyük bir sayı olmalıdır." };
  }
  return { points };
}

// updateCriterion, scoring.ts:172-173
export function kriterPuaniDuzenleme(formData: FormData): { points: number } | { error: string } {
  const points = parseDecimal(String(formData.get("pointsPerUnit") ?? ""));
  if (!Number.isFinite(points) || points < 0) return { error: "Birim başına puan 0 veya daha büyük bir sayı olmalıdır." };
  return { points };
}

// addScoreEntry, scoring.ts:276-302 (kriter/başlık zorunluluğu ve yazma dışarıda)
export function eklemeHesabi(formData: FormData, criterion: Kriter): { computed_points: number; unit_count: number; paylasim_katsayisi: number; yazar_sayisi: number; baslica_yazar: boolean; faaliyet_tarihi: string | null } | { error: string } {
  const unitCountRaw = String(formData.get("unitCount") ?? "1").trim() || "1";
  const unitCount = parseDecimal(unitCountRaw);
  if (!Number.isFinite(unitCount) || unitCount <= 0) {
    return { error: "Adet / birim sayısı 0'dan büyük bir sayı olmalıdır." };
  }
  const ayrinti = faaliyetAyrintisi(formData);
  if ("hata" in ayrinti) return { error: ayrinti.hata };
  const katsayi = paylasimKatsayisi(criterion, ayrinti.yazarSayisi, ayrinti.baslica);
  return {
    unit_count: unitCount,
    computed_points: puanHesapla(unitCount, Number(criterion.points_per_unit), katsayi),
    paylasim_katsayisi: katsayi,
    yazar_sayisi: ayrinti.yazarSayisi,
    baslica_yazar: ayrinti.baslica,
    faaliyet_tarihi: ayrinti.tarih,
  };
}

type Mevcut = { criteria_id: string; unit_count: number; computed_points: number; paylasim_katsayisi?: number | null; yazar_sayisi?: number | null; baslica_yazar?: boolean | null };

// updateScoreEntry, scoring.ts:340-392 (okuma/yazma dışarıda; kriter yalnızca gerektiğinde okunuyor)
export function duzenlemeHesabi(formData: FormData, criteriaId: string, mevcut: Mevcut, kriterOku: () => Kriter): { computed_points: number; unit_count: number; paylasim_katsayisi: number; yazar_sayisi: number; baslica_yazar: boolean; faaliyet_tarihi: string | null } | { error: string } {
  const unitCount = parseDecimal(String(formData.get("unitCount") ?? "1").trim() || "1");
  if (!Number.isFinite(unitCount) || unitCount <= 0) {
    return { error: "Adet / birim sayısı 0'dan büyük bir sayı olmalıdır." };
  }
  const ayrinti = faaliyetAyrintisi(formData);
  if ("hata" in ayrinti) return { error: ayrinti.hata };
  let birimPuan = korunanBirimPuan(mevcut, criteriaId);
  const yazarAyni =
    Number(mevcut.yazar_sayisi ?? 1) === ayrinti.yazarSayisi && Boolean(mevcut.baslica_yazar ?? true) === ayrinti.baslica;
  let katsayi = birimPuan !== null && yazarAyni ? Number(mevcut.paylasim_katsayisi ?? 1) : null;
  if (birimPuan === null || katsayi === null) {
    const criterion = kriterOku();
    if (birimPuan === null) birimPuan = Number(criterion.points_per_unit);
    katsayi = paylasimKatsayisi(criterion, ayrinti.yazarSayisi, ayrinti.baslica);
  }
  return {
    unit_count: unitCount,
    computed_points: puanHesapla(unitCount, birimPuan, katsayi),
    paylasim_katsayisi: katsayi,
    yazar_sayisi: ayrinti.yazarSayisi,
    baslica_yazar: ayrinti.baslica,
    faaliyet_tarihi: ayrinti.tarih,
  };
}

// hedefKaydet, scoring.ts:472-483
export function hedefPuanlari(formData: FormData): { asgari: number | null; azami: number | null } | { error: string } {
  const doktoraSonrasi = formData.get("doktoraSonrasi") === "1";
  const oku = (ad: string) => {
    const ham = String(formData.get(ad) ?? "").trim();
    if (!ham) return { deger: null as number | null };
    const n = parseDecimal(ham);
    return Number.isFinite(n) && n > 0 ? { deger: n } : { hata: true as const };
  };
  const asgari = oku("asgariPuan");
  const azami = doktoraSonrasi ? { deger: null } : oku("azamiPuan");
  if ("hata" in asgari || "hata" in azami) return { error: "Puanlar 0'dan büyük sayı olmalı." };
  if (asgari.deger === null && azami.deger === null) return { error: "Asgari ya da azami puandan en az birini girin." };
  return { asgari: asgari.deger, azami: azami.deger };
}
