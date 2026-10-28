import type { createAdminClient } from "@/lib/supabase/admin";
import { bireyselListeFiyatiKurus } from "@/lib/paket-ucreti";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/*
  Bireysel abonenin aylık ücreti (28.10.2026'da köprüden ayrıldı). Abonelik
  köprüsü (ödeme bağlantısı, kartla ödeme) ile otomatik yenileme işi aynı
  rakamı görmeli: karttan çekilen tutar ekranda gösterilenle aynı olmalı.

  Listede karşılığı olan ürünün (ArvoLab → Araştırmacı) fiyatı YAYIMLANMIŞ
  listeden; öteki ürün product_plans'tan. Teklif usulüne çevrilmiş basamak
  (null) kartla satılmaz.
*/
export async function bireyselAylikUcret(admin: Admin, product: string): Promise<{ aylik: number | null; denemeGunu: number }> {
  const [{ data: plan }, fiyatlar] = await Promise.all([
    admin.from("product_plans").select("individual_monthly_fee,trial_days").eq("product", product).maybeSingle(),
    yayimlananFiyatlar(),
  ]);
  const listeFiyati = bireyselListeFiyatiKurus(product, fiyatlar);
  const aylik = listeFiyati !== undefined
    ? (listeFiyati && listeFiyati > 0 ? listeFiyati : null)
    : plan?.individual_monthly_fee ? Number(plan.individual_monthly_fee) : null;
  return { aylik, denemeGunu: plan?.trial_days ?? 0 };
}
