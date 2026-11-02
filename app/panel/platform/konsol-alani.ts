import { notFound } from "next/navigation";
import { alanAdi, alanlardanBiriAcik, type KonsolAlani, type KonsolKapsami } from "@/lib/konsol-alanlari";

/*
  Konsol alanı denetimi (kural lib/konsol-alanlari.ts'te).

  BİLEREK "use server" DEĞİL: oradaki her export dışarıdan çağrılabilir
  bir uç nokta olurdu. Her konsol sayfası ve sunucu işlemi kurucu
  denetiminin hemen ardından bunu çağırıyor — yalnızca menüde gizlemek
  işlemi açıkta bırakırdı (AGENTS.md: yetki üç yerde).
*/

/** Sayfa: alan kapalıysa sayfa yok (kurucu olmayanla aynı cevap). */
export function konsolAlaniniAc(kapsam: KonsolKapsami, ...alanlar: KonsolAlani[]): void {
  if (!alanlardanBiriAcik(kapsam, alanlar)) notFound();
}

/** Sunucu işlemi: alan kapalıysa anlaşılır bir hata. */
export function konsolAlaniniDogrula(kapsam: KonsolKapsami, ...alanlar: KonsolAlani[]): void {
  if (!alanlardanBiriAcik(kapsam, alanlar)) {
    throw new Error(`Bu işlem için konsolda ${alanlar.map(alanAdi).join(" ya da ")} yetkisi gerekiyor.`);
  }
}

/** Kurucu yetkilerini değiştirmek: yalnızca tam yetkili kurucu. */
export function tamYetkiyiDogrula(kapsam: KonsolKapsami): void {
  if (kapsam !== null) throw new Error("Kurucu yetkilerini yalnızca tam yetkili kurucu değiştirebilir.");
}
