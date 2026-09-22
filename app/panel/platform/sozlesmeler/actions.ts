"use server";

import { revalidatePath } from "next/cache";
import { flashSuccess, runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAddonProduct } from "@/lib/products";
import { syncArcTenantQuietly } from "@/lib/arc-bridge";

/*
  Abonelik isteğinin onaylanması: sözleşmeden lisansa geçiş.

  İMZA MODÜLÜ AÇMAZ — istek kuyrukta bekler, kurucu tahsilatı doğrulayıp
  onaylar. İkisini tek adımda birleştirmek, parası gelmemiş her
  sözleşmenin çalışan bir kiracı yaratması demekti.

  Onay tek işlemde şunları yapar:
    1. İsteği hangi kiracıya bağlayacağımızı alır (kurucu seçer).
    2. Sözleşmedeki modüller için lisans satırlarını yazar.
    3. Ücreti ve köprü modunu işler.
    4. Köprü senkronunu tetikler.

  Kiracı AÇMIYOR. Yeni kurum kurulumu ayrı bir akış (kurulum sihirbazı) ve
  kendi adımları var; onu buraya sıkıştırmak iki farklı işi tek düğmeye
  bindirmek olurdu. Kiracı seçilmemişse onay reddediliyor.
*/

type IstenenModul = {
  product: string;
  plan_code?: string | null;
  monthly_fee?: number | null;
  integrated?: boolean;
};

/** Sözleşmedeki niyetten geçerli modülleri süzer. */
function modulleriCoz(requested: unknown): IstenenModul[] {
  const govde = (requested ?? {}) as { modules?: unknown };
  if (!Array.isArray(govde.modules)) return [];
  return govde.modules
    .map((ham) => ham as IstenenModul)
    // ArvoOS çekirdeği bu tabloda değil; lisansı organization_licenses'ta
    // ve paket değişikliği lisans ekranından yapılıyor.
    .filter((modul) => modul && typeof modul.product === "string" && isAddonProduct(modul.product));
}

async function abonelikIsteginiOnayla__impl(formData: FormData) {
  const { userId, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const istekId = String(formData.get("request_id") ?? "").trim();
  const hedefKurum = String(formData.get("target_organization_id") ?? "").trim();
  const not = String(formData.get("review_note") ?? "").trim();
  if (!istekId) throw new Error("İstek seçilmedi.");
  if (!hedefKurum) {
    throw new Error("Aboneliğin açılacağı kiracıyı seçin. Kiracı kaydı yoksa önce Kurumlar'dan açın.");
  }

  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil.");

  const { data: istek } = await admin
    .from("platform_subscription_requests")
    .select("id,status,requested,contract_no")
    .eq("id", istekId)
    .maybeSingle();
  if (!istek) throw new Error("İstek bulunamadı.");
  // Onaylanmış isteği yeniden onaylamak lisansı ikinci kez yazardı.
  if (istek.status !== "pending") throw new Error("Bu istek zaten sonuçlanmış.");

  const moduller = modulleriCoz(istek.requested);
  if (!moduller.length) {
    throw new Error(
      "Sözleşmede açılacak modül belirtilmemiş. Sözleşmeyi hazırlayan satış temsilcisinden modülleri eklemesini isteyin.",
    );
  }

  const simdi = new Date().toISOString();
  const { error: lisansHatasi } = await admin.from("organization_product_licenses").upsert(
    moduller.map((modul) => ({
      organization_id: hedefKurum,
      product: modul.product,
      status: "active",
      plan_code: modul.plan_code ?? null,
      monthly_fee: modul.monthly_fee ?? null,
      // Sözleşmede belirtilmemişse entegre: bugünkü varsayılan davranış.
      integrated: modul.integrated !== false,
      current_period_start: simdi,
      suspended_at: null,
      suspension_reason: null,
      updated_by: userId,
      updated_at: simdi,
    })),
    { onConflict: "organization_id,product" },
  );
  if (lisansHatasi) throw new Error(`Lisanslar yazılamadı: ${lisansHatasi.message}`);

  const { error } = await admin
    .from("platform_subscription_requests")
    .update({
      status: "approved",
      target_organization_id: hedefKurum,
      review_note: not || null,
      reviewed_by: userId,
      reviewed_at: simdi,
      updated_at: simdi,
    })
    .eq("id", istekId)
    // Yarış durumunda ikinci onay lisansı yeniden yazmasın.
    .eq("status", "pending");
  if (error) throw new Error(`İstek güncellenemedi: ${error.message}`);

  // Lisans yazıldığı anda ürün tarafı haberdar olmalı.
  await syncArcTenantQuietly(hedefKurum);

  revalidatePath("/panel/platform/sozlesmeler");
  revalidatePath("/panel/platform");
  await flashSuccess(`${moduller.length} modül açıldı · ${istek.contract_no ?? "sözleşme"}`);
}

export async function abonelikIsteginiOnayla(formData: FormData): Promise<void> {
  await runPanelAction(() => abonelikIsteginiOnayla__impl(formData));
}

async function abonelikIsteginiReddet__impl(formData: FormData) {
  const { userId, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const istekId = String(formData.get("request_id") ?? "").trim();
  const not = String(formData.get("review_note") ?? "").trim();
  if (!istekId) throw new Error("İstek seçilmedi.");
  /*
    Ret sebebi zorunlu: imzalı bir sözleşmeyi neden açmadığımız, üç ay
    sonra müşteri sorduğunda kayıtta olmalı.
  */
  if (!not) throw new Error("Ret sebebi zorunlu. İmzalı bir sözleşmeyi neden açmadığımız kayıtta olmalı.");

  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil.");

  const { error } = await admin
    .from("platform_subscription_requests")
    .update({
      status: "rejected",
      review_note: not,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", istekId)
    .eq("status", "pending");
  if (error) throw new Error(`İstek güncellenemedi: ${error.message}`);

  revalidatePath("/panel/platform/sozlesmeler");
  await flashSuccess("İstek reddedildi");
}

export async function abonelikIsteginiReddet(formData: FormData): Promise<void> {
  await runPanelAction(() => abonelikIsteginiReddet__impl(formData));
}
