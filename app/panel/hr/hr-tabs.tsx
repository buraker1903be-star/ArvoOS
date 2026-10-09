import { ikKayitGorur } from "../os/os-bolumler";

/*
  İnsan Kaynakları görünürlük kuralları. Bölümlerin listesi
  os/os-bolumler.ts'te (dock'un ikinci katı ve Ctrl+K). Sayfa içi sekme
  çubuğu 2026-10'da kalktı: bölümlere dock'tan gidiliyor. Prim, gizlilik ve
  hareketler de 2026-10'dan beri personel detayında.
*/
type HrAccess = { yetkiler: ReadonlySet<string>; isPlatformOwner?: boolean };

/** Gizlilik sözleşmeleri ve personel hareketleri (Genel Bakış kartları). */
export const canSeeHrRecords = (access: HrAccess) => ikKayitGorur(access);
