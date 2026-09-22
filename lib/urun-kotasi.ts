import type { ProductCode } from "@/lib/products";

/*
  Ürün kotalarının tanımı ve karşılaştırması.

  KURAL: buraya yalnızca ÖLÇÜMÜ YAZILMIŞ kota girer. ArvoOS'ta
  storage_limit_mb yıllarca girildi, kullanım hiç hesaplanmadı ve ekrandaki
  sayının karşılığı yoktu; kurucu onu bir koruma sandı. Ölçümü olmayan
  limit alanı arayüzde görünmemeli.

  Bu yüzden ARC arşiv alanı burada YOK: ölçümü ARC'ın kendi veritabanında
  bir fonksiyon gerektiriyor ve o ayrı bir depo. Ölçümü yazıldığında
  buraya eklenecek.

  Saf: testi tests/unit/urun-kotasi.test.ts.
*/

export type KotaAlani = {
  anahtar: string;
  etiket: string;
  birim: string;
  /** Kullanım bu dönemde mi sayılıyor, yoksa toplam mı. */
  donemsel: boolean;
};

export const URUN_KOTALARI: Partial<Record<ProductCode, KotaAlani[]>> = {
  arvolab: [
    { anahtar: "aylik_kontrol", etiket: "Aylık kontrol", birim: "adet", donemsel: true },
    { anahtar: "proje", etiket: "Proje", birim: "adet", donemsel: false },
  ],
  randevu: [
    { anahtar: "personel", etiket: "Personel", birim: "kişi", donemsel: false },
    { anahtar: "aylik_randevu", etiket: "Aylık randevu", birim: "adet", donemsel: true },
  ],
};

export type KotaSatiri = {
  alan: KotaAlani;
  /** Ölçüm alınamadıysa null — bilinmeyen, aşım değildir. */
  kullanilan: number | null;
  /** Limit yoksa null: sınırsız. */
  limit: number | null;
  asildi: boolean;
  /** Yüzde; limit ya da ölçüm yoksa null. */
  oran: number | null;
};

/**
 * Bir ürünün kota satırlarını kurar.
 *
 * Ölçüm alınamadığında (ürün veritabanına ulaşılamadı) kurum suçlanmıyor:
 * kullanım null kalıyor ve aşım sayılmıyor. Köprü koptuğu için bir
 * kiracının modülünü kapatmak, en kötü hata türü olurdu.
 */
export function urunKotalari(
  product: ProductCode,
  limits: Record<string, unknown> | null | undefined,
  kullanim: Record<string, number | null> | null | undefined,
): KotaSatiri[] {
  return (URUN_KOTALARI[product] ?? []).map((alan) => {
    const hamLimit = Number((limits ?? {})[alan.anahtar]);
    const limit = Number.isFinite(hamLimit) && hamLimit > 0 ? Math.round(hamLimit) : null;
    const hamKullanim = (kullanim ?? {})[alan.anahtar];
    const kullanilan = typeof hamKullanim === "number" && Number.isFinite(hamKullanim)
      ? Math.max(0, Math.round(hamKullanim))
      : null;

    return {
      alan,
      kullanilan,
      limit,
      asildi: limit !== null && kullanilan !== null && kullanilan > limit,
      oran: limit !== null && kullanilan !== null ? Math.round((kullanilan / limit) * 100) : null,
    };
  });
}

/** Matris hücresinde tek satırlık özet; kota tanımlanmamışsa null. */
export function kotaOzetiYaz(satirlar: KotaSatiri[]): string | null {
  const dolu = satirlar.filter((satir) => satir.limit !== null || satir.kullanilan !== null);
  if (!dolu.length) return null;
  return dolu
    .map((satir) => {
      // Ölçüm yoksa soru işareti: sıfır yazmak "hiç kullanılmamış" demek olurdu.
      const kullanim = satir.kullanilan === null ? "?" : String(satir.kullanilan);
      const limit = satir.limit === null ? "∞" : String(satir.limit);
      return `${kullanim}/${limit} ${satir.alan.etiket.toLocaleLowerCase("tr-TR")}`;
    })
    .join(" · ");
}
