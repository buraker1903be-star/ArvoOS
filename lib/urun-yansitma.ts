import { syncRandevuTenants } from "@/lib/randevu-bridge";
import { syncArvolabLicense } from "@/lib/arvolab";
import { syncArcTenants } from "@/lib/arc-bridge";

/*
  Ürün lisansını ürünün kendi veritabanına yansıtır. Lisans formu ve
  erişim anahtarı (modul-actions modulErisimiDegistir) AYNI yolu
  kullanıyor: ikisi ayrı yazılsaydı
  birinin hata mesajı ötekinden sapardı. Yansıtma başarısız olursa lisans
  kaydı yine de geçerli; hata kurucuya gösterilir.
*/
export async function urunLisansiniYansit(organizationId: string, product: string) {
  // ArvoLab ayrı veritabanında: durumu oraya yansıt.
  if (product === "arvolab") {
    const synced = await syncArvolabLicense(organizationId);
    if (synced === "failed") throw new Error("Lisans kaydedildi ancak ArvoLab'a yansıtılamadı. Bağlantı ayarlarını kontrol edip tekrar kaydedin.");
  }
  // ArvoARC kendi veritabanına taşındığında kademe oradan okunuyor (lib/arc-bridge.ts).
  // Kurucu ekranında hata görünsün: sessiz kalınca köprünün hiç çalışmadığı
  // (ör. ortam değişkeni girilip yeniden dağıtılmadığı) anlaşılmıyordu.
  if (product === "arc") {
    const arc = await syncArcTenants(organizationId);
    if (arc.status === "failed" || arc.errors.length)
      throw new Error(`Lisans kaydedildi ancak ArvoARC'a yansıtılamadı: ${arc.errors[0] ?? "bilinmeyen hata"}. Bağlantı ayarlarını kontrol edip tekrar kaydedin.`);
  }
  // Randevu da kendi veritabanında (lib/randevu-bridge.ts); salonun online
  // sayfası ve paneli lisansı oradan okuyor.
  if (product === "randevu") {
    const randevu = await syncRandevuTenants(organizationId);
    if (randevu.status === "not_configured")
      throw new Error("Lisans kaydedildi ancak Randevu köprüsü kapalı (RANDEVU_SUPABASE_URL / RANDEVU_SUPABASE_SECRET_KEY). Değişkenleri ekleyip yeniden dağıtın, sonra tekrar kaydedin.");
    if (randevu.status === "failed" || randevu.errors.length)
      throw new Error(`Lisans kaydedildi ancak Randevu'ya yansıtılamadı: ${randevu.errors[0] ?? "bilinmeyen hata"}. Bağlantı ayarlarını kontrol edip tekrar kaydedin.`);
  }
}
