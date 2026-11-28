/*
  Önizleme: @/lib/site/host-rules yerine.

  Konsolun kabuğu (sol gezinme, ikinci kat menü, /panel/platform
  kapısı) `isManagementHost` kararına bağlı. Kabul betikleri bir süre
  gerçek host'u (yonetim.arvo-os.com) tarayıcıda yerele eşleyerek
  kullandı; o yoldan sayfa sunucudan doğru geliyor ama Next'in
  GELİŞTİRME sunucusu localhost dışındaki bir host'ta istemci paketini
  bağlamıyor — ölçüldü: React lifleri yok, hata da yok. Sonuç:
  hiçbir istemci bileşeni çalışmıyor ve "kaydırma konumu korunmuyor"
  gibi YANLIŞ hatalar bildiriliyordu.

  Burada yalnızca TEK karar genişletiliyor: önizlemede localhost da
  yönetim host'u sayılıyor. Kararın kendisi değişmiyor; gerçek
  fonksiyon birim testleriyle (tests/unit) sınanmaya devam ediyor.
  Alias yalnızca ARVOOS_ONIZLEME=1 ile kuruluyor (next.config.ts).

  İçe aktarma GÖRELİ: `@/lib/site/host-rules` yazılsaydı alias bu
  dosyayı kendisine çevirirdi.
*/
export * from "../../lib/site/host-rules";
import { isManagementHost as gercekIsManagementHost, normalizeHost } from "../../lib/site/host-rules";

export function isManagementHost(host: string): boolean {
  if (gercekIsManagementHost(host)) return true;
  const h = normalizeHost(host);
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}
