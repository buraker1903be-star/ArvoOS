import { notFound } from "next/navigation";
import { alanAdi, alanlardanBiriAcik, kendiKurumuEngeli, type KonsolAlani, type KonsolKapsami } from "@/lib/konsol-alanlari";

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

/*
  KONSOLUN KENDİ KURUMU (02.11.2026, inceleme bulgusu).

  "Müşteriler" işlemleri (üye erişimi, sahip giriş bağlantısı, lisans,
  modül, kurum ayarı) hedef kurumu formdan alıyor ve ArvoOS'un KENDİ
  kurumunu (slug arvo-os) da kabul ediyordu. Kısıtlı bir kurucu bu yolla
  kademeli yetkinin iki kuralını da delebiliyordu: tam yetkili kurucunun
  üyeliğini kapatıp kimseyi tam yetkili bırakmamak, ya da kapalı bir
  kurucuyu (satırı olmayan = tam yetkili) yeniden açıp ona giriş
  bağlantısı üretmek. Konsolun kendi kurumuna dokunan işlem yetki
  meselesidir; yalnızca tam yetkili kurucu yapar.
*/
export function kendiKurumuysaTamYetki(kapsam: KonsolKapsami, hedefKurum: string, konsolKurumu: string): void {
  const engel = kendiKurumuEngeli(kapsam, hedefKurum, konsolKurumu);
  if (engel) throw new Error(engel);
}
