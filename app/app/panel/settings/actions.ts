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

function cleanDomain(value: string) {
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!domain) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error("Geçerli bir alan adı girin (örn. panel.firma.com).");
  return domain;
}

export async function updateCustomDomain(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Alan adı ayarlarını değiştirme yetkiniz yok.");

  const { connectDomainToVercel, disconnectDomainFromVercel } = await import("@/lib/vercel-domains");
  const domain = cleanDomain(String(formData.get("custom_domain") ?? ""));

  const { data: current } = await supabase.from("organizations").select("custom_domain").eq("id", membership.organization_id).maybeSingle();
  if (current?.custom_domain && current.custom_domain !== domain) {
    await disconnectDomainFromVercel(current.custom_domain);
  }

  if (!domain) {
    const { error } = await supabase.from("organizations").update({
      custom_domain: null, custom_domain_status: null, custom_domain_verification: null, custom_domain_updated_at: new Date().toISOString(),
    }).eq("id", membership.organization_id);
    if (error) throw new Error("Alan adı kaldırılamadı: " + error.message);
    revalidatePath("/panel/settings");
    return;
  }

  const result = await connectDomainToVercel(domain);
  if (!result.ok) throw new Error(result.message);

  const { error } = await supabase.from("organizations").update({
    custom_domain: domain,
    custom_domain_status: result.verified ? "verified" : "pending",
    custom_domain_verification: result.records,
    custom_domain_updated_at: new Date().toISOString(),
  }).eq("id", membership.organization_id);
  if (error) throw new Error("Alan adı kaydedilemedi: " + error.message);

  revalidatePath("/panel/settings");
}

export async function checkCustomDomainStatus() {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Bu işlem için yetkiniz yok.");

  const { data: org } = await supabase.from("organizations").select("custom_domain").eq("id", membership.organization_id).maybeSingle();
  if (!org?.custom_domain) throw new Error("Tanımlı bir özel alan adı yok.");

  // connectDomainToVercel, "zaten ekli" durumunu da düzgün ele alıp güncel
  // doğrulama/DNS bilgisini tazeler — sadece durumu değil, gösterilen
  // kayıtları da günceller.
  const { connectDomainToVercel } = await import("@/lib/vercel-domains");
  const result = await connectDomainToVercel(org.custom_domain);
  if (!result.ok) throw new Error(result.message);

  const { error } = await supabase.from("organizations").update({
    custom_domain_status: result.verified ? "verified" : "pending",
    custom_domain_verification: result.records,
    custom_domain_updated_at: new Date().toISOString(),
  }).eq("id", membership.organization_id);
  if (error) throw new Error("Durum güncellenemedi: " + error.message);

  revalidatePath("/panel/settings");
}