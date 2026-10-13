"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { paketListeFiyatiKurus } from "@/lib/paket-ucreti";

/*
  Kurulumu tamamlanan kiracının ücret ve deneme tanımı.

  İkisi de lisans ekranından yapılabiliyordu ama kurulum akışının
  içinde değildi: kurucu kurulumu bitiriyor, sonra ayrı bir ekrana
  gidip paketi bulup ücreti elle yazıyordu. Ücret zaten YAYIMLANMIŞ
  (lib/site/pricing.ts); elle yazmak hem fazladan iş hem de listeden
  sapma kaynağıydı.
*/

async function listeFiyatiniUygula__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) throw new Error("Kurum seçilmedi.");

  const { data: lisans } = await supabase.from("organization_licenses")
    .select("plan_code,monthly_fee").eq("organization_id", organizationId).maybeSingle();
  if (!lisans) throw new Error("Kurumun lisans kaydı yok; önce kurulumu tamamlayın.");

  const fiyat = paketListeFiyatiKurus(lisans.plan_code as string);
  /* Teklif usulü pakete (Özel kurum) liste fiyatı yazılamaz: pazarlıkla
     belirlenen tutarı liste fiyatı gibi göstermek olurdu. */
  if (fiyat === null) throw new Error("Bu paketin yayımlanmış liste fiyatı yok; tutarı lisans ekranından girin.");

  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("organization_licenses")
    .update({ monthly_fee: fiyat, updated_by: userData.user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (error) throw new Error("Ücret yazılamadı: " + error.message);

  revalidatePath("/panel/platform/kurulumlar");
  revalidatePath("/panel/platform/licenses");
}

async function denemeyiAyarla__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) throw new Error("Kurum seçilmedi.");
  const gun = Number(String(formData.get("gun") ?? "").trim());
  if (!Number.isSafeInteger(gun) || gun < 0 || gun > 365) throw new Error("Deneme süresi 0 ile 365 gün arasında olmalı.");

  const { data: userData } = await supabase.auth.getUser();
  /*
    0 gün = denemeyi bitir. Tarihi geçmişe yazmak yerine alanı
    boşaltıyoruz; "denemesi dün bitti" ile "denemesi hiç olmadı" ayrı
    şeyler ve lisans durumu ikisini farklı okuyor.
  */
  const bitis = gun > 0 ? new Date(Date.now() + gun * 24 * 60 * 60 * 1000).toISOString() : null;
  const { error } = await supabase.from("organization_licenses")
    .update({
      trial_ends_at: bitis,
      license_status: gun > 0 ? "trialing" : "active",
      updated_by: userData.user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);
  if (error) throw new Error("Deneme süresi yazılamadı: " + error.message);

  revalidatePath("/panel/platform/kurulumlar");
  revalidatePath("/panel/platform/licenses");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function listeFiyatiniUygula(...args: Parameters<typeof listeFiyatiniUygula__impl>) {
  return runPanelAction(() => listeFiyatiniUygula__impl(...args), "Liste fiyatı uygulandı");
}
export async function denemeyiAyarla(...args: Parameters<typeof denemeyiAyarla__impl>) {
  return runPanelAction(() => denemeyiAyarla__impl(...args), "Deneme süresi güncellendi");
}
