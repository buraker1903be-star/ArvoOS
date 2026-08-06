"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPanelContext, panelModules } from "@/lib/panel-context";

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

export async function createCustomerOrganization(formData: FormData) {
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

export async function updateOrganizationSettings(formData: FormData) {
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

  const { data: current } = await supabase.from("organizations").select("custom_domain").eq("id", organizationId).maybeSingle();
  const updates: Record<string, unknown> = { name, display_name: displayName || null, sector, plan_code: planCode, custom_domain: customDomain, updated_at: new Date().toISOString() };

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

export async function toggleOrganizationModule(formData: FormData) {
  const { supabase, organizationId } = await requireFounderTarget(formData);
  const moduleCode = String(formData.get("module_code") ?? "");
  const isEnabled = String(formData.get("is_enabled") ?? "") === "true";
  if (!panelModules[moduleCode]) throw new Error("Geçersiz modül.");
  const { error } = await supabase.from("organization_modules").update({ is_enabled: isEnabled }).eq("organization_id", organizationId).eq("module_code", moduleCode);
  if (error) throw new Error("Modül durumu değiştirilemedi.");
  revalidatePath("/panel", "layout");
  revalidatePath(`/panel/platform?organization=${organizationId}`);
}
