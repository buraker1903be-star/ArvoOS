"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { PERMISSION_MODULES, PERMISSION_ROLES } from "@/lib/role-permissions";
import { TUM_YETKILER, varsayilanAcikMi, yetkiDegisikligiEngeli } from "@/lib/yetkiler";

const YETKI_YONETIMI = "settings.yetki.yonet";

/*
  Yetkilendirme ekranının kapısı artık kendi yetenek anahtarında.

  Eskiden üç ayrı yerde `["owner","admin"].includes(role)` yazıyordu; kurum
  Yönetici'den yetkilendirmeyi almak isterse yapamıyordu, çünkü kuralın
  kendisi koddaydı. Varsayılan aynı (owner + admin), fark artık
  değiştirilebilir olması.
*/
async function yetkiContext() {
  const context = await getPanelContext();
  if (!context.izin(YETKI_YONETIMI)) {
    throw new Error("Yetkilendirme ayarlarını değiştirme yetkiniz yok.");
  }
  return context;
}

async function updateModulePermissions__impl(formData: FormData) {
  const { supabase, membership, userId } = await yetkiContext();

  const rows = PERMISSION_ROLES.flatMap((role) =>
    PERMISSION_MODULES.map((module) => ({
      organization_id: membership.organization_id,
      role: role.key,
      module_key: module.key,
      can_access: formData.get(`perm:${role.key}:${module.key}`) === "on",
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }))
  );

  const { error } = await supabase
    .from("role_module_permissions")
    .upsert(rows, { onConflict: "organization_id,role,module_key" });
  if (error) throw new Error("Yetkilendirme kaydedilemedi: " + error.message);

  revalidatePath("/panel/settings/permissions");
  revalidatePath("/panel");
}

async function updateCapabilityPermissions__impl(formData: FormData) {
  const { supabase, membership, userId } = await yetkiContext();

  const acikMi = (rol: string, key: string) => formData.get(`cap:${rol}:${key}`) === "on";

  /*
    Kendi ayağına sıkma koruması: Yetkilendirme ekranını açan Yönetici kendi
    "Yetkilendirme" kutucuğunu kapatırsa sayfaya bir daha giremez ve geri
    açacak tek kişi Kurum Sahibi kalır. Küçük kurumlarda o kişi aynı kişi.
  */
  const engel = yetkiDegisikligiEngeli({
    rol: membership.role,
    kendisiMi: PERMISSION_ROLES.some((role) => role.key === membership.role),
    yetkiYonetimiAcikKaliyor: acikMi(membership.role, YETKI_YONETIMI),
  });
  if (engel) throw new Error(engel);

  const rows = PERMISSION_ROLES.flatMap((role) =>
    TUM_YETKILER.map((yetki) => ({
      organization_id: membership.organization_id,
      role: role.key,
      capability_key: yetki.key,
      allowed: acikMi(role.key, yetki.key),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }))
  );

  const { error } = await supabase
    .from("role_capability_permissions")
    .upsert(rows, { onConflict: "organization_id,role,capability_key" });
  if (error) throw new Error("Yetkiler kaydedilemedi: " + error.message);

  revalidatePath("/panel/settings/permissions");
  revalidatePath("/panel");
}

/*
  Kişi istisnaları. Üç değerli: "rolden" (istisna yok), "acik", "kapali".
  "rolden" seçilen satır SİLİNİR — istisna tablosunda satır bırakmak,
  sonradan rol kuralı değiştiğinde o kişiyi eski kararda dondurur ve
  "neden bu kişide farklı" sorusunun cevabı görünmez olur.
*/
async function updateMemberPermissions__impl(formData: FormData) {
  const { supabase, membership, userId } = await yetkiContext();
  const hedef = String(formData.get("user_id") ?? "").trim();
  if (!hedef) throw new Error("Kişi seçilmedi.");

  const { data: hedefUyelik, error: uyelikHatasi } = await supabase
    .from("organization_memberships")
    .select("role,is_active")
    .eq("organization_id", membership.organization_id)
    .eq("user_id", hedef)
    .maybeSingle();
  if (uyelikHatasi) throw new Error("Üyelik okunamadı: " + uyelikHatasi.message);
  if (!hedefUyelik) throw new Error("Bu kişi kurumun üyesi değil.");
  // Kurum Sahibi kısıtlanamaz; istisna yazmak sessizce etkisiz kalırdı.
  if (hedefUyelik.role === "owner") throw new Error("Kurum Sahibi kısıtlanamaz.");

  const secim = (ad: string) => String(formData.get(ad) ?? "rolden");

  const { data: rolKurallari, error: rolHatasi } = await supabase
    .from("role_capability_permissions")
    .select("capability_key,allowed")
    .eq("organization_id", membership.organization_id)
    .eq("role", hedefUyelik.role);
  if (rolHatasi) throw new Error("Rol yetkileri okunamadı: " + rolHatasi.message);
  const rolKurali = new Map((rolKurallari ?? []).map((row) => [row.capability_key as string, row.allowed as boolean]));

  if (hedef === userId) {
    const secilen = secim(`mcap:${YETKI_YONETIMI}`);
    const rolDegeri = rolKurali.has(YETKI_YONETIMI)
      ? rolKurali.get(YETKI_YONETIMI)!
      : varsayilanAcikMi(hedefUyelik.role, YETKI_YONETIMI);
    const engel = yetkiDegisikligiEngeli({
      rol: membership.role,
      kendisiMi: true,
      yetkiYonetimiAcikKaliyor: secilen === "acik" || (secilen === "rolden" && rolDegeri),
    });
    if (engel) throw new Error(engel);
  }

  const yetkiSatirlari = TUM_YETKILER
    .map((yetki) => ({ key: yetki.key, secim: secim(`mcap:${yetki.key}`) }))
    .filter((satir) => satir.secim !== "rolden");
  const modulSatirlari = PERMISSION_MODULES
    .map((module) => ({ key: module.key, secim: secim(`mmod:${module.key}`) }))
    .filter((satir) => satir.secim !== "rolden");

  const ortak = { organization_id: membership.organization_id, user_id: hedef, updated_by: userId, updated_at: new Date().toISOString() };

  const silinecekYetkiler = TUM_YETKILER.map((yetki) => yetki.key).filter((key) => !yetkiSatirlari.some((satir) => satir.key === key));
  const silinecekModuller = PERMISSION_MODULES.map((module) => module.key).filter((key) => !modulSatirlari.some((satir) => satir.key === key));

  const islemler = [];
  if (yetkiSatirlari.length) {
    islemler.push(supabase.from("member_capability_permissions").upsert(
      yetkiSatirlari.map((satir) => ({ ...ortak, capability_key: satir.key, allowed: satir.secim === "acik" })),
      { onConflict: "organization_id,user_id,capability_key" },
    ));
  }
  if (silinecekYetkiler.length) {
    islemler.push(supabase.from("member_capability_permissions").delete()
      .eq("organization_id", membership.organization_id).eq("user_id", hedef)
      .in("capability_key", silinecekYetkiler));
  }
  if (modulSatirlari.length) {
    islemler.push(supabase.from("member_module_permissions").upsert(
      modulSatirlari.map((satir) => ({ ...ortak, module_key: satir.key, can_access: satir.secim === "acik" })),
      { onConflict: "organization_id,user_id,module_key" },
    ));
  }
  if (silinecekModuller.length) {
    islemler.push(supabase.from("member_module_permissions").delete()
      .eq("organization_id", membership.organization_id).eq("user_id", hedef)
      .in("module_key", silinecekModuller));
  }

  for (const sonuc of await Promise.all(islemler)) {
    if (sonuc.error) throw new Error("Kişi yetkileri kaydedilemedi: " + sonuc.error.message);
  }

  revalidatePath("/panel/settings/permissions");
  revalidatePath(`/panel/settings/permissions/${hedef}`);
  revalidatePath("/panel");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function updateModulePermissions(...args: Parameters<typeof updateModulePermissions__impl>) {
  return runPanelAction(() => updateModulePermissions__impl(...args), "Modül erişimi kaydedildi");
}

export async function updateCapabilityPermissions(...args: Parameters<typeof updateCapabilityPermissions__impl>) {
  return runPanelAction(() => updateCapabilityPermissions__impl(...args), "Yetkiler kaydedildi");
}

export async function updateMemberPermissions(...args: Parameters<typeof updateMemberPermissions__impl>) {
  return runPanelAction(() => updateMemberPermissions__impl(...args), "Kişi yetkileri kaydedildi");
}
