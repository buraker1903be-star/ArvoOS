"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { LEGAL_FIELDS, firstLegalError, legalDetailsFrom, normalizeLegalDetails, validateLegalDetails } from "./legal-details";

const text = (formData: FormData, key: string, max = 500) =>
  String(formData.get(key) ?? "").trim().slice(0, max);

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const extensionByType: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function updateDocumentBranding__impl(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) {
    throw new Error("Kurumsal kimlik ayarlarını değiştirme yetkiniz yok.");
  }

  // Varsayılan: panelin şampanya vurgusu (eskiden yeşil #183f31 yazılıyordu)
  const primaryColor = text(formData, "primary_color", 20) || "#8e6d33";
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

async function updateLegalDetails__impl(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) {
    throw new Error("Kurumun resmi bilgilerini değiştirme yetkiniz yok.");
  }

  const raw = legalDetailsFrom(Object.fromEntries(LEGAL_FIELDS.map((field) => [field, String(formData.get(field) ?? "").slice(0, 1000)])));
  const invalid = firstLegalError(validateLegalDetails(raw));
  if (invalid) throw new Error(invalid);
  const values = normalizeLegalDetails(raw);

  // RLS engellediğinde update hata vermez, 0 satır döner; bu yüzden
  // etkilenen satır ayrıca kontrol edilir.
  const { data: saved, error } = await supabase
    .from("organizations")
    .update({
      ...Object.fromEntries(LEGAL_FIELDS.map((field) => [field, values[field] || null])),
      updated_at: new Date().toISOString(),
    })
    .eq("id", membership.organization_id)
    .select("id");

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      throw new Error("Kurum bilgileri kaydedilemedi: veritabanı güncellemesi henüz uygulanmamış.");
    }
    if (error.code === "23514") {
      throw new Error("Kurum bilgileri kaydedilemedi: alanlardan biri geçerli biçimde değil (IBAN, vergi numarası veya MERSİS).");
    }
    throw new Error("Kurum bilgileri kaydedilemedi: " + error.message);
  }
  if (!saved?.length) throw new Error("Kurum bilgileri kaydedilemedi: bu işlem için yetkiniz yok.");

  revalidatePath("/panel/settings");
}

function cleanDomain(value: string) {
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!domain) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error("Geçerli bir alan adı girin (örn. panel.firma.com).");
  return domain;
}

async function updateCustomDomain__impl(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Alan adı ayarlarını değiştirme yetkiniz yok.");

  const { connectDomainToVercel, disconnectDomainFromVercel, isPlatformDomain } = await import("@/lib/vercel-domains");
  const domain = cleanDomain(String(formData.get("custom_domain") ?? ""));
  if (domain && isPlatformDomain(domain)) throw new Error("Bu alan adı platforma ait; kendi alan adınızı girin (örn. panel.firma.com).");

  const { data: current } = await supabase.from("organizations").select("custom_domain").eq("id", membership.organization_id).maybeSingle();
  const previous: string | null = current?.custom_domain ?? null;

  // Sıra önemli: veritabanı önce güncellenir, eski alan adı Vercel'den ancak
  // kayıt başarılı olursa kaldırılır. Eskiden eski alan adı önce siliniyor,
  // kayıt başarısız olursa kurumun çalışan alan adı da kapanıyordu.
  if (!domain) {
    const { data: cleared, error } = await supabase.from("organizations").update({
      custom_domain: null, custom_domain_status: null, custom_domain_verification: null, custom_domain_updated_at: new Date().toISOString(),
    }).eq("id", membership.organization_id).select("id");
    if (error) throw new Error("Alan adı kaldırılamadı: " + error.message);
    if (!cleared?.length) throw new Error("Alan adı kaldırılamadı: bu işlem için yetkiniz yok.");
    if (previous) await disconnectDomainFromVercel(previous);
    revalidatePath("/panel/settings");
    return;
  }

  if (domain !== previous) {
    const { data: available, error: availabilityError } = await supabase.rpc("arvo_custom_domain_available", {
      p_domain: domain,
      p_organization_id: membership.organization_id,
    });
    if (availabilityError) throw new Error("Alan adı kontrol edilemedi: " + availabilityError.message);
    if (!available) throw new Error("Bu alan adı başka bir kurum tarafından kullanılıyor.");
  }

  const result = await connectDomainToVercel(domain, { allowExisting: domain === previous });
  if (!result.ok) throw new Error(result.message);

  const { data: saved, error } = await supabase.from("organizations").update({
    custom_domain: domain,
    custom_domain_status: result.verified ? "verified" : "pending",
    custom_domain_verification: result.records,
    custom_domain_updated_at: new Date().toISOString(),
  }).eq("id", membership.organization_id).select("id");
  if (error || !saved?.length) {
    // Az önce eklediğimiz alan adını geri al; kurumun eski alan adı çalışmaya devam eder.
    if (domain !== previous) await disconnectDomainFromVercel(domain);
    throw new Error(error ? "Alan adı kaydedilemedi: " + error.message : "Alan adı kaydedilemedi: bu işlem için yetkiniz yok.");
  }
  if (previous && previous !== domain) await disconnectDomainFromVercel(previous);

  revalidatePath("/panel/settings");
}

async function checkCustomDomainStatus__impl() {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Bu işlem için yetkiniz yok.");

  const { data: org } = await supabase.from("organizations").select("custom_domain").eq("id", membership.organization_id).maybeSingle();
  if (!org?.custom_domain) throw new Error("Tanımlı bir özel alan adı yok.");

  // connectDomainToVercel, "zaten ekli" durumunu da düzgün ele alıp güncel
  // doğrulama/DNS bilgisini tazeler — sadece durumu değil, gösterilen
  // kayıtları da günceller.
  const { connectDomainToVercel } = await import("@/lib/vercel-domains");
  const result = await connectDomainToVercel(org.custom_domain, { allowExisting: true });
  if (!result.ok) throw new Error(result.message);

  const { data: updated, error } = await supabase.from("organizations").update({
    custom_domain_status: result.verified ? "verified" : "pending",
    custom_domain_verification: result.records,
    custom_domain_updated_at: new Date().toISOString(),
  }).eq("id", membership.organization_id).select("id");
  if (error) throw new Error("Durum güncellenemedi: " + error.message);
  if (!updated?.length) throw new Error("Durum güncellenemedi: bu işlem için yetkiniz yok.");

  revalidatePath("/panel/settings");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function updateDocumentBranding(...args: Parameters<typeof updateDocumentBranding__impl>) {
  return runPanelAction(() => updateDocumentBranding__impl(...args), "Belge ayarları kaydedildi");
}
export async function updateLegalDetails(...args: Parameters<typeof updateLegalDetails__impl>) {
  return runPanelAction(() => updateLegalDetails__impl(...args), "Kurum bilgileri kaydedildi");
}
export async function updateCustomDomain(...args: Parameters<typeof updateCustomDomain__impl>) {
  return runPanelAction(() => updateCustomDomain__impl(...args), "Alan adı kaydedildi");
}
export async function checkCustomDomainStatus(...args: Parameters<typeof checkCustomDomainStatus__impl>) {
  return runPanelAction(() => checkCustomDomainStatus__impl(...args));
}
