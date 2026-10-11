"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { PERMISSION_MODULES, PERMISSION_ROLES } from "@/lib/role-permissions";
import { TUM_YETKILER, varsayilanAcikMi, yetkiDegisikligiEngeli } from "@/lib/yetkiler";
import { profilBul, profilModulKararlari } from "@/lib/yetki-profilleri";
import { yonetimDepartmanindaMi } from "@/lib/yonetim-departmani";
import { syncArcTenantQuietly } from "@/lib/arc-bridge";
import { syncRandevuTenantQuietly } from "@/lib/randevu-bridge";
import { syncArvolabMembers } from "@/lib/arvolab";

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

/*
  HAZIR PROFİL UYGULAMA — "bu kişi operasyon müdürü olacak" tek adımda.

  Profil kişiye yazılıyor (role değil): aynı rolde hem satış hem
  operasyon müdürü olabilir, ikisinin göreceği modüller farklıdır.
  Yazılanlar: üyelik rolü, BÜTÜN modüller için açık/kapalı kararı ve
  profilin tanım yetenekleri. Profilin dışındaki kişisel yetenek
  istisnaları SİLİNİYOR — "bu kişide neden farklı" sorusunun cevabı
  profil olmalı, bir yıl önce açılmış unutulmuş bir kutucuk değil.

  Korumalar ekip eylemleriyle aynı: Kurum Sahibi'ne profil
  uygulanmıyor (kısıtlanamaz), Yönetim departmanındaki kişinin rolü
  tetikleyiciyle owner'a döndüğü için reddediliyor, ve kişi KENDİNE
  yetkilendirmeyi kapatan bir profil uygulayamıyor (sayfaya bir daha
  giremezdi).
*/
async function applyPermissionProfile__impl(formData: FormData) {
  const { supabase, membership, userId } = await yetkiContext();
  const hedef = String(formData.get("user_id") ?? "").trim();
  const profil = profilBul(String(formData.get("profil") ?? "").trim());
  if (!hedef) throw new Error("Kişi seçilmedi.");
  if (!profil) throw new Error("Profil tanınmadı.");

  const { data: hedefUyelik, error: uyelikHatasi } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", membership.organization_id)
    .eq("user_id", hedef)
    .maybeSingle();
  if (uyelikHatasi) throw new Error("Üyelik okunamadı: " + uyelikHatasi.message);
  if (!hedefUyelik) throw new Error("Bu kişi kurumun üyesi değil.");
  if (hedefUyelik.role === "owner") throw new Error("Kurum Sahibi kısıtlanamaz.");
  if (await yonetimDepartmanindaMi(supabase, membership.organization_id, "user_id", hedef)) {
    throw new Error("Bu kişi Yönetici departmanında olduğu için Kurum Sahibi yetkisine sahip. Profil uygulamak için önce departmanını değiştirin.");
  }

  /* Kendine uygulama: profil yetkilendirmeyi kapatıyorsa sayfaya bir
     daha girilemez ve geri açacak tek kişi Kurum Sahibi kalır. */
  if (hedef === userId) {
    const engel = yetkiDegisikligiEngeli({
      rol: membership.role,
      kendisiMi: true,
      yetkiYonetimiAcikKaliyor:
        profil.acikYetkiler.includes(YETKI_YONETIMI) || varsayilanAcikMi(profil.rol, YETKI_YONETIMI),
    });
    if (engel) throw new Error(engel);
  }

  const ortak = { organization_id: membership.organization_id, user_id: hedef, updated_by: userId, updated_at: new Date().toISOString() };
  const silinecekYetkiler = TUM_YETKILER
    .map((yetki) => yetki.key)
    .filter((key) => !profil.acikYetkiler.includes(key));

  /*
    ROL DEĞİŞİMİ KULLANICI İSTEMCİSİYLE. Üyelik tablosunda UPDATE
    politikası 12.10.2026'ya kadar hiç yoktu; o güne kadar panelden rol
    değiştirmek sessizce hiçbir satıra dokunmuyordu
    (20261011224845). Politika kuralın ikizini taşıyor: Kurum Sahibi
    satırına yalnızca Kurum Sahibi dokunur, owner rolünü yalnızca
    Kurum Sahibi verir. Buradaki profil hiçbir zaman owner atamıyor.
  */
  if (hedefUyelik.role !== profil.rol) {
    const { data: guncellenen, error: rolHatasi } = await supabase.from("organization_memberships")
      .update({ role: profil.rol })
      .eq("organization_id", membership.organization_id)
      .eq("user_id", hedef)
      .select("user_id");
    if (rolHatasi) throw new Error("Rol değiştirilemedi: " + rolHatasi.message);
    if (!guncellenen?.length) throw new Error("Rol değiştirilemedi: yetkiniz yok veya kayıt bulunamadı.");
  }

  const islemler = [
    supabase.from("member_module_permissions").upsert(
      profilModulKararlari(profil, PERMISSION_MODULES).map((karar) => ({ ...ortak, ...karar })),
      { onConflict: "organization_id,user_id,module_key" },
    ),
    supabase.from("member_capability_permissions").upsert(
      profil.acikYetkiler.map((key) => ({ ...ortak, capability_key: key, allowed: true })),
      { onConflict: "organization_id,user_id,capability_key" },
    ),
    supabase.from("member_capability_permissions").delete()
      .eq("organization_id", membership.organization_id).eq("user_id", hedef)
      .in("capability_key", silinecekYetkiler),
  ];
  for (const sonuc of await Promise.all(islemler)) {
    if (sonuc.error) throw new Error("Profil uygulanamadı: " + sonuc.error.message);
  }

  /* Rol değişince diğer ürünlerdeki kopya da tazelenmeli (ekip
     eylemlerindeki akışın aynısı). */
  await Promise.all([
    syncArcTenantQuietly(membership.organization_id),
    syncRandevuTenantQuietly(membership.organization_id),
    syncArvolabMembers(membership.organization_id),
  ]);

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

export async function applyPermissionProfile(...args: Parameters<typeof applyPermissionProfile__impl>) {
  return runPanelAction(() => applyPermissionProfile__impl(...args), "Profil uygulandı");
}
