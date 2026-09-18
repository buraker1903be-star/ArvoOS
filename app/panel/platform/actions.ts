"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPanelContext, panelModules } from "@/lib/panel-context";
import { syncArcTenantQuietly } from "@/lib/arc-bridge";
import { createAdminClient } from "@/lib/supabase/admin";

// DİKKAT: "use server" dosyasında `export type { X }` yeniden dışa aktarımı
// yazmayın; modül çöker. `export type X = {...}` sorunsuz.
export type OwnerLinkState = { error: string | null; link: string | null; email: string | null; note: string | null };

const plans = new Set(["starter", "professional", "enterprise"]);

function cleanDomain(value: string) {
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!domain) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error("Geçerli bir alan adı girin.");
  return domain;
}

function cleanSlug(value: string) {
  const slug = value.trim().toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  if (slug.length < 2) throw new Error("Kurum kısa adı en az 2 karakter olmalı.");
  return slug;
}

async function requireFounderTarget(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) throw new Error("Yönetilecek kurum seçilmedi.");
  const { data: target, error } = await supabase.from("organizations").select("id,slug").eq("id", organizationId).maybeSingle();
  if (error || !target) throw new Error("Hedef kurum bulunamadı.");
  return { supabase, organizationId, target };
}

async function createCustomerOrganization__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const name = String(formData.get("name") ?? "").trim();
  const slug = cleanSlug(String(formData.get("slug") ?? name));
  const sector = String(formData.get("sector") ?? "general").trim();
  const planCode = String(formData.get("plan_code") ?? "starter").trim();
  const ownerName = String(formData.get("owner_name") ?? "").trim();
  const ownerEmail = String(formData.get("owner_email") ?? "").trim().toLowerCase();
  const customDomain = cleanDomain(String(formData.get("custom_domain") ?? ""));
  const seedCrm = formData.get("seed_crm") === "on";
  const seedOperations = formData.get("seed_operations") === "on";

  if (name.length < 2 || name.length > 160) throw new Error("Kurum adı 2–160 karakter olmalı.");
  if (sector.length < 2 || sector.length > 80) throw new Error("Sektör alanı 2–80 karakter olmalı.");
  if (!plans.has(planCode)) throw new Error("Geçerli bir paket seçin.");
  if (ownerName.length < 2 || ownerName.length > 120) throw new Error("Owner adı 2–120 karakter olmalı.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new Error("Geçerli bir owner e-posta adresi girin.");

  const requestHeaders = await headers();
  const redirectBase = requestHeaders.get("origin") ?? "https://app.arvo-os.com";
  const { data, error } = await supabase.functions.invoke("provision-organization", {
    body: { name, slug, sector, planCode, ownerName, ownerEmail, customDomain, seedCrm, seedOperations, redirectBase },
  });
  if (error || !data?.organization_id) {
    const message = data?.error || error?.message || "Kurum provisioning işlemi tamamlanamadı.";
    throw new Error(message);
  }

  revalidatePath("/panel", "layout");
  redirect(`/panel/platform?organization=${data.organization_id}&provisioned=1`);
}

async function updateOrganizationSettings__impl(formData: FormData) {
  const { supabase, organizationId } = await requireFounderTarget(formData);
  const name = String(formData.get("name") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const sector = String(formData.get("sector") ?? "").trim();
  const planCode = String(formData.get("plan_code") ?? "").trim();
  const customDomain = cleanDomain(String(formData.get("custom_domain") ?? ""));
  if (name.length < 2 || name.length > 160) throw new Error("Kurum adı 2–160 karakter olmalı.");
  if (displayName && (displayName.length < 2 || displayName.length > 80)) throw new Error("Tabela unvanı 2–80 karakter olmalı.");
  if (sector.length < 2 || sector.length > 80) throw new Error("Sektör alanı 2–80 karakter olmalı.");
  if (!plans.has(planCode)) throw new Error("Geçerli bir paket seçin.");

  /*
    Kurum türü: kendi markalarımız müşteri sayımlarına ve gelir toplamına
    karışmasın diye. Erişimi ya da faturalamayı etkilemez, yalnızca Platform
    ekranlarındaki etiket ve sayaçlar için.
  */
  const kind = formData.get("kind") === "internal" ? "internal" : "customer";
  const { data: current } = await supabase.from("organizations").select("custom_domain").eq("id", organizationId).maybeSingle();
  const updates: Record<string, unknown> = { name, display_name: displayName || null, sector, plan_code: planCode, custom_domain: customDomain, kind, updated_at: new Date().toISOString() };

  if (customDomain !== (current?.custom_domain ?? null)) {
    const { connectDomainToVercel, disconnectDomainFromVercel } = await import("@/lib/vercel-domains");
    if (current?.custom_domain) await disconnectDomainFromVercel(current.custom_domain);
    if (customDomain) {
      const result = await connectDomainToVercel(customDomain);
      if (!result.ok) throw new Error(result.message);
      updates.custom_domain_status = result.verified ? "verified" : "pending";
      updates.custom_domain_verification = result.records;
    } else {
      updates.custom_domain_status = null;
      updates.custom_domain_verification = null;
    }
  }

  const { error } = await supabase.from("organizations").update(updates).eq("id", organizationId);
  if (error) throw new Error("Kurum ayarları kaydedilemedi.");
  revalidatePath("/panel", "layout");
  revalidatePath(`/panel/platform?organization=${organizationId}`);
}

async function toggleOrganizationModule__impl(formData: FormData) {
  const { supabase, organizationId } = await requireFounderTarget(formData);
  const moduleCode = String(formData.get("module_code") ?? "");
  const isEnabled = String(formData.get("is_enabled") ?? "") === "true";
  if (!panelModules[moduleCode]) throw new Error("Geçersiz modül.");
  const { error } = await supabase.from("organization_modules").update({ is_enabled: isEnabled }).eq("organization_id", organizationId).eq("module_code", moduleCode);
  if (error) throw new Error("Modül durumu değiştirilemedi.");
  if (moduleCode === "commerce") await syncArcTenantQuietly(organizationId);
  revalidatePath("/panel", "layout");
  revalidatePath(`/panel/platform?organization=${organizationId}`);
}

/**
 * Kurum sahibine tek kullanımlık giriş bağlantısı üretir (davet e-postası
 * gelmediğinde ya da süresi dolduğunda kurucu WhatsApp'tan gönderir).
 * Hesabı açılmamış sahip için davet bağlantısı (şifre belirleyip katılır,
 * üyelik davet tetikleyicisiyle etkinleşir); hesabı açık sahip için şifre
 * yenileme bağlantısı. Bağlantı /auth/callback → /auth/set-password akışını
 * kullanır; saklanmaz, yalnızca kurucuya gösterilir.
 */
export async function createOwnerAccessLink(_previous: OwnerLinkState, formData: FormData): Promise<OwnerLinkState> {
  const empty: OwnerLinkState = { error: null, link: null, email: null, note: null };
  const { supabase, isPlatformOwner, userId } = await getPanelContext();
  if (!isPlatformOwner) return { ...empty, error: "Bu işlem için kurucu yetkisi gerekiyor." };
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) return { ...empty, error: "Kurum seçilmedi." };

  const { data: invitation } = await supabase
    .from("organization_invitations")
    .select("id,email,status,auth_user_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!invitation?.email) return { ...empty, error: "Bu kurum için sahip daveti bulunamadı." };

  const admin = createAdminClient();
  if (!admin) return { ...empty, error: "Sunucu anahtarı (SUPABASE_SECRET_KEY) tanımlı olmadığı için bağlantı oluşturulamadı." };

  const origin = (await headers()).get("origin") ?? "https://app.arvo-os.com";
  const redirectTo = `${origin}/auth/callback?next=/panel`;
  let type: "invite" | "recovery" = "invite";
  let generated = await admin.auth.admin.generateLink({
    type: "invite",
    email: invitation.email,
    options: { redirectTo, data: { arvoos_invitation_id: invitation.id, arvoos_organization_id: organizationId, full_name: "Kurum Sahibi" } },
  });
  if (generated.error) {
    // Hesap zaten doğrulanmış: davet yerine şifre yenileme bağlantısı
    type = "recovery";
    generated = await admin.auth.admin.generateLink({ type: "recovery", email: invitation.email, options: { redirectTo } });
  }
  const hashedToken = generated.data?.properties?.hashed_token;
  if (generated.error || !hashedToken) {
    return { ...empty, error: `Giriş bağlantısı oluşturulamadı: ${generated.error?.message ?? "bilinmeyen hata"}` };
  }

  const now = new Date().toISOString();
  if (invitation.status !== "accepted") {
    await admin.from("organization_invitations").update({
      status: "sent",
      auth_user_id: invitation.auth_user_id ?? generated.data.user?.id ?? null,
      sent_at: now,
      updated_at: now,
      error_message: null,
    }).eq("id", invitation.id);
    await admin.from("organizations").update({ provisioning_state: "waiting_owner" }).eq("id", organizationId).in("provisioning_state", ["failed", "inviting_owner"]);
  }
  await admin.from("provisioning_audit_logs").insert({
    organization_id: organizationId,
    invitation_id: invitation.id,
    actor_user_id: userId,
    action: "owner_access_link",
    state: invitation.status === "accepted" ? "active" : "waiting_owner",
    result: "success",
    details: { type, owner_email: invitation.email },
  });
  revalidatePath("/panel/platform");

  const link = `${origin}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=${type}&next=${encodeURIComponent("/panel")}`;
  return {
    error: null,
    link,
    email: invitation.email,
    note: type === "invite"
      ? "Sahip bağlantıyı açınca şifresini belirleyip panele girer."
      : "Hesap zaten açık; bağlantı yeni şifre belirletip panele sokar.",
  };
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function createCustomerOrganization(...args: Parameters<typeof createCustomerOrganization__impl>) {
  return runPanelAction(() => createCustomerOrganization__impl(...args), "Kurum oluşturuldu");
}
export async function updateOrganizationSettings(...args: Parameters<typeof updateOrganizationSettings__impl>) {
  return runPanelAction(() => updateOrganizationSettings__impl(...args), "Kurum ayarları kaydedildi");
}
export async function toggleOrganizationModule(...args: Parameters<typeof toggleOrganizationModule__impl>) {
  return runPanelAction(() => toggleOrganizationModule__impl(...args));
}
