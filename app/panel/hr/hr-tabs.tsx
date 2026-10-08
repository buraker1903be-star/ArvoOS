import { ikBolumleri, ikKayitGorur, primGorur } from "../os/os-bolumler";
import { ModulSekmeleri } from "../os/modul-sekmeleri";

// İnsan Kaynakları modülünün sekmeleri. Liste ve görünürlük kuralları
// os/os-bolumler.ts'te (dock'un ikinci katı ve Ctrl+K ile ortak). Her sekme,
// açtığı sayfanın kendi yetki kuralıyla görünür.
export type HrTabKey = "genel-bakis" | "personel" | "prim" | "prim-hesabi" | "gizlilik" | "hareketler";

type HrAccess = { yetkiler: ReadonlySet<string>; isPlatformOwner?: boolean };

/** Prim hesaplama: commissions/page.tsx ile aynı kural. */
export const canSeeCommissions = (access: HrAccess) => primGorur(access);

/** Gizlilik sözleşmeleri ve personel hareketleri: ilgili sayfalarla aynı kural. */
export const canSeeHrRecords = (access: HrAccess) => ikKayitGorur(access);

export function HrTabs({ active, access }: { active: HrTabKey; access: HrAccess }) {
  return <ModulSekmeleri bolumler={ikBolumleri(access)} aktif={active} etiket="İnsan Kaynakları bölümleri" />;
}
