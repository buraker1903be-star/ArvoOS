"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { alanAdi, alanSecimi } from "@/lib/konsol-alanlari";
import { konsolKaydiYaz } from "../konsol-kaydi";
import { konsolAlaniniDogrula, tamYetkiyiDogrula } from "../konsol-alani";

/*
  KADEMELİ KURUCU YETKİSİ (02.11.2026, lib/konsol-alanlari).

  Üç kural, üçü de veritabanında da var (migration 20261102181453); burada
  yetkisiz isteğin sessizce "başarılı" görünmemesi ve anlaşılır mesaj için:
    - yalnızca TAM yetkili kurucu değiştirir;
    - kimse kendi yetkisini değiştiremez (en az bir tam yetkili kalır);
    - hedef ArvoOS kurumunun etkin sahibi olmalı (başkasına satır yazmak
      anlamsız: konsola zaten giremez).
*/
async function kurucuAlanlariniKaydet__impl(formData: FormData) {
  const { supabase, userId, isPlatformOwner, konsolKapsami, organization } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");
  konsolAlaniniDogrula(konsolKapsami, "sistem");
  tamYetkiyiDogrula(konsolKapsami);

  const hedef = String(formData.get("user_id") ?? "").trim();
  if (!hedef) throw new Error("Kurucu seçilmedi.");
  if (hedef === userId) throw new Error("Kendi yetkinizi değiştiremezsiniz; başka bir tam yetkili kurucu değiştirebilir.");

  const { data: uyelik, error: uyelikHatasi } = await supabase.from("organization_memberships")
    .select("user_id").eq("organization_id", organization.id).eq("user_id", hedef).eq("role", "owner").eq("is_active", true).maybeSingle();
  if (uyelikHatasi) throw new Error("Kurucu okunamadı: " + uyelikHatasi.message);
  if (!uyelik) throw new Error("Bu kişi ArvoOS kurumunun etkin Kurum Sahibi değil; konsola zaten giremiyor.");

  const tam = String(formData.get("tam") ?? "") === "1";
  const alanlar = alanSecimi(formData.getAll("alan"));
  if (!tam && !alanlar.length) throw new Error("En az bir alan seçin ya da tam yetki verin.");

  const { data: onceki, error: oncekiHatasi } = await supabase.from("platform_kurucu_alanlari").select("alanlar").eq("user_id", hedef).maybeSingle();
  if (oncekiHatasi) throw new Error("Mevcut yetki okunamadı: " + oncekiHatasi.message);
  const yaz = (a: readonly string[] | null) => (a === null ? "Tam yetki" : a.map(alanAdi).join(", "));
  const once = onceki ? yaz(onceki.alanlar as string[]) : "Tam yetki";

  /* Beş alanın hepsi seçildiyse bile tam yetki DEĞİL: tam yetkili kurucu
     başkalarının yetkisini de değiştirebiliyor. Bunu açıkça "tam" seçmek ister. */
  const { error } = tam
    ? await supabase.from("platform_kurucu_alanlari").delete().eq("user_id", hedef)
    : await supabase.from("platform_kurucu_alanlari").upsert(
        { user_id: hedef, alanlar, guncelleyen: userId, guncellendi: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  if (error) throw new Error("Yetki kaydedilemedi: " + error.message);

  const sonra = tam ? "Tam yetki" : yaz(alanlar);
  await konsolKaydiYaz({
    organizationId: organization.id, userId, entityType: "founder_scope", entityId: hedef,
    baslik: "Kurucu yetkisi değişti",
    degisiklikler: once === sonra ? [] : [{ alan: "alanlar", ad: "Konsol alanları", once, sonra }],
  });
  revalidatePath("/panel", "layout");
}

export async function kurucuAlanlariniKaydet(formData: FormData): Promise<void> {
  await runPanelAction(() => kurucuAlanlariniKaydet__impl(formData), "Kurucu yetkisi kaydedildi");
}

