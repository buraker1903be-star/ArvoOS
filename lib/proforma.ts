/*
  PLATFORM PROFORMASI: kalemler, KDV ve ödeme eşleştirme (27.10.2026).

  Akış: proforma → müşteri öder → tahsilat makbuzu → fatura. Proformayı
  kurucu Tahsilat ekranında hazırlıyor; tablo platform_proformalari
  (migration 20261027174258).

  Tutarlar KURUŞ ve KDV HARİÇ yazılıyor; KDV ayrı satır. Toplamı formdan
  almıyoruz, kalemlerden burada hesaplıyoruz: veritabanı yalnızca
  `toplam = ara_toplam + kdv` tutarlılığını denetleyebiliyor, kalemlerle
  ara toplamın uyumunu bu modül sağlıyor.

  Saf modül: Next'e ve Supabase'e dokunmuyor, birim testi
  tests/unit/proforma.test.ts.
*/

export type ProformaKalemi = { aciklama: string; miktar: number; birim_fiyat: number };

export type ProformaToplami = { araToplam: number; kdv: number; toplam: number };

export const AZAMI_KALEM = 20;
export const VARSAYILAN_KDV_ORANI = 20;

/** Satır tutarı: miktar × birim fiyat, kuruşa yuvarlanmış. */
export function kalemTutari(k: ProformaKalemi) {
  return Math.round(k.miktar * k.birim_fiyat);
}

/*
  KDV ara toplamın üzerinden BİR KEZ hesaplanıp yuvarlanır, satır satır
  değil: satır başına yuvarlamak çok kalemli proformada toplamı birkaç
  kuruş saptırıyor ve kesilecek faturayla tutmuyordu (faturada KDV
  matrahın tamamı üzerinden).
*/
export function proformaToplami(kalemler: ProformaKalemi[], kdvOrani: number): ProformaToplami {
  const araToplam = kalemler.reduce((t, k) => t + kalemTutari(k), 0);
  const kdv = Math.round((araToplam * kdvOrani) / 100);
  return { araToplam, kdv, toplam: araToplam + kdv };
}

/*
  Formdan gelen satırları okur. Form sabit sayıda satır gönderiyor;
  tamamen boş satır atlanır (kullanıcı kullanmadığı satırı doldurmak
  zorunda kalmasın), yarım satır ise hata: açıklaması olup tutarı
  olmayan bir kalemi sessizce düşürmek müşteriye eksik proforma
  göndermek olurdu.

  Tutar `kurus` ile okunur (çağıran kurusOku'yu verir) — "1.500" bin beş
  yüz liradır, bir buçuk değil.
*/
export function kalemleriOku(
  satirlar: { aciklama: string; miktar: string; birimFiyat: string }[],
  kurus: (deger: string) => number,
): ProformaKalemi[] {
  const kalemler: ProformaKalemi[] = [];
  satirlar.forEach((s, i) => {
    const aciklama = s.aciklama.trim();
    const miktarMetni = s.miktar.trim();
    const fiyatMetni = s.birimFiyat.trim();
    if (!aciklama && !fiyatMetni) return;
    const sira = i + 1;
    if (!aciklama) throw new Error(`${sira}. kalemin açıklamasını yazın.`);
    if (aciklama.length > 200) throw new Error(`${sira}. kalemin açıklaması 200 karakteri aşıyor.`);
    const miktar = miktarMetni ? Number(miktarMetni.replace(",", ".")) : 1;
    if (!Number.isFinite(miktar) || miktar <= 0 || miktar > 10000) throw new Error(`${sira}. kalemin miktarı geçersiz.`);
    const birim_fiyat = kurus(fiyatMetni);
    if (!Number.isFinite(birim_fiyat) || birim_fiyat <= 0) throw new Error(`${sira}. kalemin birim fiyatını yazın.`);
    kalemler.push({ aciklama, miktar, birim_fiyat });
  });
  if (!kalemler.length) throw new Error("En az bir kalem yazın.");
  if (kalemler.length > AZAMI_KALEM) throw new Error(`En fazla ${AZAMI_KALEM} kalem yazılabilir.`);
  return kalemler;
}

/** Veritabanından gelen jsonb'yi tipe çevirir; bozuk satırı atlar (gösterimde çökmesin). */
export function kalemleriCoz(ham: unknown): ProformaKalemi[] {
  if (!Array.isArray(ham)) return [];
  return ham.flatMap((k) => {
    if (!k || typeof k !== "object") return [];
    const { aciklama, miktar, birim_fiyat } = k as Record<string, unknown>;
    if (typeof aciklama !== "string" || typeof miktar !== "number" || typeof birim_fiyat !== "number") return [];
    return [{ aciklama, miktar, birim_fiyat }];
  });
}

export type EslesmeOdemesi = { id: string; tutar: number; tarih: string | null };

/*
  "Ödemeyle eşleştir" penceresindeki seçenekler. Çağıran yalnızca AYNI
  MÜŞTERİNİN ve henüz bir proformaya bağlanmamış ödemelerini veriyor;
  burada sıralanıyor: tutarı proforma toplamına eşit olanlar önce, sonra
  yeniden eskiye. Tutarı tutmayanlar da listede kalıyor — müşteri
  havalede küsuratı yuvarlamış olabilir, karar kurucunun.
*/
export function eslesmeSirasi<T extends EslesmeOdemesi>(toplam: number, odemeler: T[]): (T & { tutarTutuyor: boolean })[] {
  return odemeler
    .map((o) => ({ ...o, tutarTutuyor: o.tutar === toplam }))
    .sort((a, b) => Number(b.tutarTutuyor) - Number(a.tutarTutuyor) || (b.tarih ?? "").localeCompare(a.tarih ?? ""));
}

/*
  Geçerlilik tarihi geçmiş ve ödenmemiş proforma "süresi doldu" görünür.
  Durum sütununa yazılmıyor: tarih geçti diye kayıt değişmesin, geç gelen
  ödeme yine eşlenebilsin. Karşılaştırma Türkiye günüyle (YYYY-MM-DD).
*/
export function proformaGorunumu(durum: string, gecerlilik: string, bugun: string): "bekliyor" | "odendi" | "iptal" | "suresi_doldu" {
  if (durum === "odendi" || durum === "iptal") return durum;
  return gecerlilik < bugun ? "suresi_doldu" : "bekliyor";
}

export const PROFORMA_DURUM_ADI = {
  bekliyor: "Ödeme bekleniyor",
  odendi: "Ödendi",
  iptal: "İptal edildi",
  suresi_doldu: "Süresi doldu",
} as const;
