import { syncRandevuTenants } from "@/lib/randevu-bridge";
import { syncArvolabLicense } from "@/lib/arvolab";
import { syncArcTenants } from "@/lib/arc-bridge";
import { kopruluUrun, yansitmaHatasi, type KopruSonucu } from "@/lib/yansitma-hatasi";

/*
  Ürün lisansını ürünün kendi veritabanına yansıtır.

  Lisans formu, modül erişim anahtarı ve "yeniden yansıt" düğmesi AYNI
  yolu kullanıyor: üçü ayrı yazıldığında birinin hata mesajı
  ötekinden sapıyordu ve ArvoARC'ta "köprü kapalı" hâli hiç hata
  sayılmıyordu (lib/yansitma-hatasi.ts).

  Yansıtma başarısız olursa lisans kaydı yine de geçerli; hata
  kurucuya gösterilir.
*/
export async function urunLisansiniYansit(organizationId: string, product: string) {
  if (!kopruluUrun(product)) return;

  const sonuc: KopruSonucu =
    product === "arvolab"
      ? /* ArvoLab köprüsü düz metin döndürüyor; ortak şekle sarılıyor. */
        { status: await syncArvolabLicense(organizationId) }
      : product === "arc"
        ? await syncArcTenants(organizationId)
        : await syncRandevuTenants(organizationId);

  const hata = yansitmaHatasi(product, sonuc);
  if (hata) throw new Error(hata);
}
