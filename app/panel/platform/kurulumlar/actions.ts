"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { paketListeFiyatiKurus } from "@/lib/paket-ucreti";
import { ekKalemTutari } from "@/lib/site/fiyat-kaynagi";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";

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

  /* YAYIMLANMIŞ liste (14.10.2026): eskiden koddaki rakam yazılıyordu;
     konsolda zam yayımlansa da yeni kurulum eski fiyatla açılıyordu. */
  const fiyatlar = await yayimlananFiyatlar();
  const fiyat = paketListeFiyatiKurus(lisans.plan_code as string, fiyatlar);
  /* Teklif usulü pakete (Özel kurum) liste fiyatı yazılamaz: pazarlıkla
     belirlenen tutarı liste fiyatı gibi göstermek olurdu. */
  if (fiyat === null) throw new Error("Bu paketin yayımlanmış liste fiyatı yok; tutarı lisans ekranından girin.");

  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("organization_licenses")
    /* Ek kullanıcı birim bedeli de listeden: sütunun veritabanı
       varsayılanı (24900) sabit bir kopya, liste değişince eskirdi. */
    .update({ monthly_fee: fiyat, extra_user_fee: ekKalemTutari("ek-kullanici", fiyatlar) ?? 0, updated_by: userData.user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (error) throw new Error("Ücret yazılamadı: " + error.message);

  revalidatePath("/panel/platform/kurulumlar");
  revalidatePath("/panel/platform/musteriler", "layout");
}

/*
  "Deneme günü uygula" kısayolu kaldırıldı (14.10.2026): Kurulum listesinin
  her satırında bir formdu; deneme süresi müşteri detayının Lisanslar
  penceresindeki lisans formunda (deneme bitişi) duruyor. Kullanılmayan bir
  sunucu işlemi açık bırakılmadı.
*/

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function listeFiyatiniUygula(...args: Parameters<typeof listeFiyatiniUygula__impl>) {
  return runPanelAction(() => listeFiyatiniUygula__impl(...args), "Liste fiyatı uygulandı");
}
