"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { uploadOrganizationImage } from "@/lib/organization-assets";

async function completeOnboarding__impl(formData: FormData) {
  const { supabase, organization, membership } = await getPanelContext();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Onboarding işlemini yalnızca kurum sahibi veya yöneticisi tamamlayabilir.");
  }

  const legalName = String(formData.get("legal_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const primaryColor = String(formData.get("primary_color") ?? "#8e6d33").trim();

  if (legalName.length < 2 || legalName.length > 180) {
    throw new Error("Resmi kurum adı 2–180 karakter olmalı.");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
    throw new Error("Geçerli bir marka rengi seçin.");
  }

  // Logo dosyası seçildiyse yüklenir; seçilmediyse (daha önce girilmiş) adres korunur.
  const uploadedLogo = await uploadOrganizationImage(supabase, organization.id, formData.get("logo_file"), "logo", "Logo");
  const logoUrl = uploadedLogo ?? String(formData.get("logo_url") ?? "").trim();

  const { error } = await supabase.rpc("complete_organization_onboarding", {
    p_organization_id: organization.id,
    p_legal_name: legalName,
    p_phone: phone,
    p_website: website,
    p_logo_url: logoUrl,
    p_primary_color: primaryColor,
  });

  if (error) throw new Error(error.message || "Onboarding tamamlanamadı.");

  // Bilgiler belgelerin, müşteri takip ekranının ve panelin okuduğu kurum
  // kaydına da yazılır. Eskiden yalnızca organization_onboarding'de kalıyordu;
  // müşteri logo ve iletişim bilgisi girse de teklif/sözleşmede görünmüyordu.
  const updates: Record<string, unknown> = { primary_color: primaryColor, updated_at: new Date().toISOString() };
  if (logoUrl) updates.logo_url = logoUrl;
  if (phone) updates.contact_phone = phone.slice(0, 80);
  if (website) updates.website_url = website.slice(0, 500);
  // Kurulum kaydı zaten tamamlandı; bu adım başarısız olursa kullanıcı
  // yarım kalmasın diye hata fırlatılmaz, bilgiler Ayarlar'dan düzeltilebilir.
  const { data: savedOrganization, error: organizationError } = await supabase.from("organizations").update(updates).eq("id", organization.id).select("id");
  if (organizationError || !savedOrganization?.length) console.error("[onboarding] kurum kaydı güncellenemedi", organizationError?.message ?? "0 satır (RLS)");

  // Ticari unvan boşsa resmi ad yazılır (Ayarlar → Resmi bilgiler'de düzenlenir).
  const { error: legalError } = await supabase.from("organizations").update({ legal_name: legalName }).eq("id", organization.id).is("legal_name", null);
  if (legalError) console.error("[onboarding] ticari unvan yazılamadı", legalError.message);

  revalidatePath("/panel", "layout");
  redirect("/panel?onboarding=completed");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function completeOnboarding(...args: Parameters<typeof completeOnboarding__impl>) {
  return runPanelAction(() => completeOnboarding__impl(...args), "Çalışma alanınız hazır");
}
