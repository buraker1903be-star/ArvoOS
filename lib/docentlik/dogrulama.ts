/*
  DOÇENTLİK PUANI: GİRDİ DOĞRULAMA (14.11.2026, F6 PR1 — ArvoLab'dan taşındı).

  ArvoLab'da bu kurallar sunucu işleminin (app/actions/scoring.ts) içinde
  satır içi duruyordu ve FormData'ya bağlıydı; test edilemiyordu. Burada
  düz metin alan saf fonksiyonlar olarak duruyor. Kabul ettikleri değerler
  ve verdikleri hata metinleri kaynakla AYNI — eşdeğerlik testi
  tests/unit/kaynak/arvolab/scoring-mantigi.ts'teki aktarıma karşı sınıyor.

  Fırlatmazlar: bozuk girdi `{ ok: false, hata }` döner, hata metni
  kullanıcıya gösterilecek Türkçe cümledir.

  BİLİNEN TUHAFLIKLAR (kaynakta böyle; taşımada DEĞİŞTİRİLMEDİ, çünkü
  değiştirmek kayıtlı puanlarla yeni hesaplar arasında fark açar —
  karar ayrıca verilmeli, PR açıklamasında listeli):
   - ondalikOku YALNIZCA ilk virgülü noktaya çevirir ve noktayı ondalık
     sayar: "1.500" → 1,5 (ArvoOS'un para kuralının tersi); "1,5,0" → NaN.
   - Yazar sayısı virgül kabul etmez ("2,0" geçersiz), "2.0" ise 2 sayılır.
   - Kriter DÜZENLEMEDE boş birim puan 0 kabul edilir (Number("") = 0);
     eklemede boş alan "zorunlu" hatası verir.
   - Tarih yalnızca biçimle denetlenir: "2024-13-45" geçer.
*/

import { VARSAYILAN_KURAL, type KuralSeti } from "./kural-surumu";

export type Sonuc<T> = { ok: true; deger: T } | { ok: false; hata: string };

const hata = (metin: string): { ok: false; hata: string } => ({ ok: false, hata: metin });

/** Kaynaktaki parseDecimal: ilk virgül ondalık ayırıcıya çevrilir. */
export function ondalikOku(ham: string): number {
  return Number(ham.trim().replace(",", "."));
}

const metin = (ham: string | null | undefined) => String(ham ?? "").trim();

/** Ortak yazarlık katsayısı: boş = tanımsız (null); doluysa (0, 1]. */
export function katsayiOku(ham: string | null | undefined): Sonuc<number | null> {
  const m = metin(ham);
  if (!m) return { ok: true, deger: null };
  const sayi = ondalikOku(m);
  if (!Number.isFinite(sayi) || sayi <= 0 || sayi > 1) {
    return hata("Yazar katsayısı 0 ile 1 arasında olmalı (örn. 0,8); paylaşım yoksa boş bırakın.");
  }
  return { ok: true, deger: sayi };
}

/** Faaliyetin birim (adet) sayısı: boşsa 1; 0'dan büyük olmalı, ondalık olabilir. */
export function birimSayisiOku(ham: string | null | undefined): Sonuc<number> {
  const m = String(ham ?? "1").trim() || "1";
  const sayi = ondalikOku(m);
  if (!Number.isFinite(sayi) || sayi <= 0) return hata("Adet / birim sayısı 0'dan büyük bir sayı olmalıdır.");
  return { ok: true, deger: sayi };
}

/*
  Kriterin birim puanı. 0 geçerlidir ("şart ama puansız" faaliyetler var).
  Eklemede boş alan reddedilir; düzenlemede kaynak boşu 0 sayıyordu, aynen
  korunur (yukarıdaki tuhaflıklar listesinde).
*/
export function kriterPuaniOku(ham: string | null | undefined, islem: "ekleme" | "duzenleme"): Sonuc<number> {
  const m = metin(ham);
  if (islem === "ekleme" && !m) return hata("Kod, etiket ve puan alanları zorunludur.");
  const sayi = ondalikOku(m);
  if (!Number.isFinite(sayi) || sayi < 0) return hata("Birim başına puan 0 veya daha büyük bir sayı olmalıdır.");
  return { ok: true, deger: sayi };
}

export type FaaliyetAyrintisi = { yazarSayisi: number; baslica: boolean; tarih: string | null };

/* Faaliyetin yazar bilgisi ve tarihi. Tarih boş olabilir. Tek yazarlı faaliyette yazar her zaman başlıcadır. */
export function faaliyetAyrintisiOku(
  girdi: { yazarSayisi?: string | null; baslicaYazar?: string | null; faaliyetTarihi?: string | null },
  kural: KuralSeti = VARSAYILAN_KURAL,
): Sonuc<FaaliyetAyrintisi> {
  const yazarHam = String(girdi.yazarSayisi ?? "1").trim() || "1";
  const yazarSayisi = Number(yazarHam);
  if (!Number.isInteger(yazarSayisi) || yazarSayisi < 1 || yazarSayisi > kural.azamiYazarSayisi) {
    return hata(`Yazar sayısı 1 ile ${kural.azamiYazarSayisi} arasında bir tam sayı olmalı.`);
  }
  const tarih = metin(girdi.faaliyetTarihi) || null;
  if (tarih && !/^\d{4}-\d{2}-\d{2}$/.test(tarih)) return hata("Tarih geçersiz.");
  return {
    ok: true,
    deger: { yazarSayisi, baslica: yazarSayisi === 1 || String(girdi.baslicaYazar ?? "evet") === "evet", tarih },
  };
}

/*
  Hedef satırının sınırları: asgari, azami ya da ikisi. Tavan dönemden
  bağımsız: doktora sonrası satırına azami yazılmaz (verilse de yok sayılır).
*/
export function hedefPuanlariOku(girdi: {
  asgariPuan?: string | null;
  azamiPuan?: string | null;
  doktoraSonrasi: boolean;
}): Sonuc<{ asgari: number | null; azami: number | null }> {
  const oku = (ham: string | null | undefined): Sonuc<number | null> => {
    const m = metin(ham);
    if (!m) return { ok: true, deger: null };
    const n = ondalikOku(m);
    return Number.isFinite(n) && n > 0 ? { ok: true, deger: n } : hata("Puanlar 0'dan büyük sayı olmalı.");
  };
  const asgari = oku(girdi.asgariPuan);
  const azami: Sonuc<number | null> = girdi.doktoraSonrasi ? { ok: true, deger: null } : oku(girdi.azamiPuan);
  if (!asgari.ok || !azami.ok) return hata("Puanlar 0'dan büyük sayı olmalı.");
  if (asgari.deger === null && azami.deger === null) return hata("Asgari ya da azami puandan en az birini girin.");
  return { ok: true, deger: { asgari: asgari.deger, azami: azami.deger } };
}
