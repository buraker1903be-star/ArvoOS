"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext, panelModules } from "@/lib/panel-context";

const plans = new Set(["trial", "starter", "professional", "enterprise"]);

function cleanDomain(value: string) {
  const domain = value.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (!domain) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error("Geçerli bir alan adı girin.");
  }
  return domain;
}

async function requireFounderTarget(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) throw new Error("Yönetilecek kurum seçilmedi.");

  const { data: target, error } = await supabase.from("organizations")
    .select("id,slug")
    .eq("id", organizationId)
    .maybeSingle();

  if (error || !target) throw new Error("Hedef kurum bulunamadı.");
  return { supabase, organizationId, target };
}

export async function updateOrganizationSettings(formData: FormData) {
  const { supabase, organizationId } = await requireFounderTarget(formData);

  const name = String(formData.get("name") ?? "").trim();
  const sector = String(formData.get("sector") ?? "").trim();
  const planCode = String(formData.get("plan_code") ?? "").trim();
  const customDomain = cleanDomain(String(formData.get("custom_domain") ?? ""));

  if (name.length < 2 || name.length > 160) throw new Error("Kurum adı 2–160 karakter olmalı.");
  if (sector.length < 2 || sector.length > 80) throw new Error("Sektör alanı 2–80 karakter olmalı.");
  if (!plans.has(planCode)) throw new Error("Geçerli bir paket seçin.");

  const { error } = await supabase.from("organizations").update({
    name,
    sector,
    plan_code: planCode,
    custom_domain: customDomain,
    updated_at: new Date().toISOString(),
  }).eq("id", organizationId);

  if (error) throw new Error("Kurum ayarları kaydedilemedi.");
  revalidatePath("/panel", "layout");
  revalidatePath(`/panel/platform?organization=${organizationId}`);
}

export async function toggleOrganizationModule(formData: FormData) {
  const { supabase, organizationId } = await requireFounderTarget(formData);

  const moduleCode = String(formData.get("module_code") ?? "");
  const isEnabled = String(formData.get("is_enabled") ?? "") === "true";
  if (!panelModules[moduleCode]) throw new Error("Geçersiz modül.");

  const { error } = await supabase.from("organization_modules")
    .update({ is_enabled: isEnabled })
    .eq("organization_id", organizationId)
    .eq("module_code", moduleCode);

  if (error) throw new Error("Modül durumu değiştirilemedi.");
  revalidatePath("/panel", "layout");
  revalidatePath(`/panel/platform?organization=${organizationId}`);
}
