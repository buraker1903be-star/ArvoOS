"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

export async function completeOnboarding(formData: FormData) {
  const { supabase, organization, membership } = await getPanelContext();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Onboarding işlemini yalnızca kurum sahibi veya yöneticisi tamamlayabilir.");
  }

  const legalName = String(formData.get("legal_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const logoUrl = String(formData.get("logo_url") ?? "").trim();
  const primaryColor = String(formData.get("primary_color") ?? "#111827").trim();

  if (legalName.length < 2 || legalName.length > 180) {
    throw new Error("Resmi kurum adı 2–180 karakter olmalı.");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
    throw new Error("Geçerli bir marka rengi seçin.");
  }

  const { error } = await supabase.rpc("complete_organization_onboarding", {
    p_organization_id: organization.id,
    p_legal_name: legalName,
    p_phone: phone,
    p_website: website,
    p_logo_url: logoUrl,
    p_primary_color: primaryColor,
  });

  if (error) throw new Error(error.message || "Onboarding tamamlanamadı.");

  revalidatePath("/panel", "layout");
  redirect("/panel?onboarding=completed");
}
