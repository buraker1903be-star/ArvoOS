import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { urunKullanimi } from "@/lib/urun-kullanimi";
import { arvolabYansimasi } from "@/lib/arvolab";
import { arcUrunKopyasi } from "@/lib/arc-bridge";
import { randevuUrunKopyasi } from "@/lib/randevu-bridge";

/*
  KONSOLUN YAVAŞ ÖLÇÜMLERİ, KISA ÖNBELLEKTE (14.10.2026).

  Müşteri detayının Lisanslar ve Kurum Ayarları pencereleri her açılışta
  üç ayrı veritabanına (ArvoLab, ArvoARC, Randevu) gidip kullanımı ve
  lisans kopyasını okuyor, bir de bütün kurumların depolamasını
  topluyordu: pencere 0,7–1,2 saniyede açılıyordu ve sürenin çoğu bu
  dış okumalardı. Hiçbiri kullanıcıya özel değil (yalnızca kurucu
  görüyor, service_role ile okunuyor), o yüzden paylaşılan önbellek
  güvenli.

  Süreler: kullanım ve kopya 60 sn, depolama 5 dk. Kota ve AI kredisi bir
  dakika eski görünebilir — karar verdiren bir sayı değil, eğilim.
  KOPYA ise kayıttan HEMEN sonra doğru görünmeli ("kaydettim ama
  ürün eski diyor"): lisans ve modül işlemleri kurumun etiketini
  updateTag ile düşürüyor (lisansOlcumEtiketi).

  Okuma yardımcıları ulaşamayınca null döndürüyor, fırlatmıyor; null da
  önbelleğe giriyor — bir dakika "ölçülemedi" görünür, sonra yeniden
  denenir.
*/

export const lisansOlcumEtiketi = (organizationId: string) => `lisans-olcum-${organizationId}`;

export function lisansOlcumleri(organizationId: string) {
  return unstable_cache(
    async () => {
      const [kullanim, arvolabKopyasi, arcKopyasi, randevuKopyasi] = await Promise.all([
        urunKullanimi(organizationId),
        arvolabYansimasi(organizationId),
        arcUrunKopyasi(organizationId),
        randevuUrunKopyasi(organizationId),
      ]);
      return { kullanim, arvolabKopyasi, arcKopyasi, randevuKopyasi };
    },
    ["lisans-olcum", organizationId],
    { revalidate: 60, tags: [lisansOlcumEtiketi(organizationId)] },
  )();
}

/** Kurum başına depolama (bayt). storage.objects'i tarayan işlev; bütün kurumlar tek seferde. */
export const depolamaKullanimi = unstable_cache(
  async (): Promise<{ organization_id: string; bytes: number }[]> => {
    const admin = createAdminClient();
    if (!admin) return [];
    const { data, error } = await admin.rpc("arvo_storage_usage");
    if (error) {
      console.error("[konsol] depolama kullanımı okunamadı", error.message);
      return [];
    }
    return ((data ?? []) as { organization_id: string; bytes: number }[]).map((satir) => ({
      organization_id: satir.organization_id,
      bytes: Number(satir.bytes ?? 0),
    }));
  },
  ["depolama-kullanimi"],
  { revalidate: 300 },
);
