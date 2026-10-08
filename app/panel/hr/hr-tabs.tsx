import { ikKayitGorur, primGorur } from "../os/os-bolumler";

/*
  İnsan Kaynakları görünürlük kuralları. Bölümlerin listesi
  os/os-bolumler.ts'te (dock'un ikinci katı ve Ctrl+K). Sayfa içi sekme
  çubuğu 2026-10'da kalktı: bölümlere dock'tan gidiliyor.
*/
type HrAccess = { yetkiler: ReadonlySet<string>; isPlatformOwner?: boolean };

/** Prim hesaplama: commissions/page.tsx ile aynı kural. */
export const canSeeCommissions = (access: HrAccess) => primGorur(access);

/** Gizlilik sözleşmeleri ve personel hareketleri: ilgili sayfalarla aynı kural. */
export const canSeeHrRecords = (access: HrAccess) => ikKayitGorur(access);
