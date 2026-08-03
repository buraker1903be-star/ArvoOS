"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const text = (formData: FormData, key: string, max = 500) =>
  String(formData.get(key) ?? "").trim().slice(0, max);

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const extensionByType: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function updateDocumentBranding(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) {
    throw new Error("Kurumsal kimlik ayarlarını değiştirme yetkiniz yok.");
  }

  const primaryColor = text(formData, "primary_color", 20) || "#183f31";
  if (!/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
    throw new Error("Kurumsal renk geçersiz.");
  }

  const { data: current, error: currentError } = await supabase
    .from("organizations")
    .select("signature_stamp_url")
    .eq("id", membership.organization_id)
    .single();

  if (currentError) {
    throw new Error("Mevcut kurumsal kimlik bilgileri okunamadı: " + currentError.message);
  }

  let signatureStampUrl = current?.signature_stamp_url ?? null;
  const removeSignature = formData.get("remove_signature") === "on";
  const signatureFile = formData.get("signature_file");

  if (removeSignature) {
    signatureStampUrl = null;
  }

  if (signatureFile instanceof File && signatureFile.size > 0) {
    if (!allowedTypes.has(signatureFile.type)) {
      throw new Error("Kaşe ve imza görseli PNG, JPG veya WEBP olmalıdır.");
    }
    if (signatureFile.size > 5 * 1024 * 1024) {
      throw new Error("Kaşe ve imza görseli en fazla 5 MB olabilir.");
    }

    const extension = extensionByType[signatureFile.type];
    const objectPath = `${membership.organization_id}/signature-stamp.${extension}`;
    const fileBuffer = await signatureFile.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("organization-assets")
      .upload(objectPath, fileBuffer, {
        contentType: signatureFile.type,
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) {
      throw new Error("Kaşe ve imza görseli yüklenemedi: " + uploadError.message);
    }

    const { data: publicUrlData } = supabase.storage
      .from("organization-assets")
      .getPublicUrl(objectPath);

    signatureStampUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      logo_url: text(formData, "logo_url", 1000) || null,
      primary_color: primaryColor,
      document_footer: text(formData, "document_footer", 500) || null,
      contact_email: text(formData, "contact_email", 240) || null,
      contact_phone: text(formData, "contact_phone", 80) || null,
      website_url: text(formData, "website_url", 500) || null,
      signature_stamp_url: signatureStampUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", membership.organization_id);

  if (error) {
    throw new Error("Kurumsal kimlik kaydedilemedi: " + error.message);
  }

  revalidatePath("/panel/settings");
}