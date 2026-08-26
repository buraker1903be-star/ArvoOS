"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

export async function signConfidentialityAgreement(agreementId: string, formData: FormData) {
  const { supabase, userId } = await getPanelContext();
  const signerName = String(formData.get("signer_name") ?? "").trim().slice(0, 180);
  const signatureData = String(formData.get("signature_data") ?? "");
  if (formData.get("accepted") !== "on" || signerName.length < 2) throw new Error("Sözleşme onayı ve ad soyad zorunludur.");
  const match = signatureData.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Geçerli bir imza çiziniz.");
  const signature = Buffer.from(match[1], "base64");
  if (!signature.length || signature.length > 524288) throw new Error("İmza dosyası geçersiz veya çok büyük.");

  const { data: agreement, error } = await supabase.from("hr_confidentiality_agreements")
    .select("id,organization_id,employee_id,status,hr_employees!inner(user_id)")
    .eq("id", agreementId).maybeSingle();
  const employeeRelation = agreement?.hr_employees as unknown as { user_id: string | null } | { user_id: string | null }[] | null;
  const employee = Array.isArray(employeeRelation) ? employeeRelation[0] : employeeRelation;
  if (error || !agreement || employee?.user_id !== userId || agreement.status !== "pending") throw new Error("İmzalanabilir sözleşme bulunamadı.");

  const path = `${agreement.organization_id}/${agreement.employee_id}/${agreement.id}-${crypto.randomUUID()}.png`;
  const { error: uploadError } = await supabase.storage.from("hr-confidentiality-signatures").upload(path, signature, { contentType: "image/png", upsert: false });
  if (uploadError) throw new Error("İmza güvenli alana kaydedilemedi: " + uploadError.message);

  const requestHeaders = await headers();
  const ip = (requestHeaders.get("x-forwarded-for") || requestHeaders.get("x-real-ip") || "").split(",")[0].trim() || null;
  const { data: signed, error: updateError } = await supabase.from("hr_confidentiality_agreements").update({
    status: "signed", signer_name: signerName, signature_path: path, signer_ip: ip,
    signer_user_agent: requestHeaders.get("user-agent")?.slice(0, 500) || null,
    signed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", agreement.id).eq("status", "pending").select("id").maybeSingle();
  if (updateError || !signed) {
    await supabase.storage.from("hr-confidentiality-signatures").remove([path]);
    throw new Error("Sözleşme imzalanamadı: " + (updateError?.message || "Kayıt değişti."));
  }
  redirect(`/panel/confidentiality/${agreement.id}?signed=1`);
}
