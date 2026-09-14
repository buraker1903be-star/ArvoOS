"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_TEXT_VERSION, detectCustomerKind } from "@/app/_components/legal/format";

const firstForwardedIp = (value: string | null) => value?.split(",")[0]?.trim() || null;

// Hatalar URL'de metin olarak değil kod olarak taşınır; sayfa kodu sabit bir
// mesaja çevirir. Eskiden "?error=..." içindeki her metin kurum logolu
// sözleşmenin içinde gösteriliyordu (ör. sahte IBAN talimatı).
const contractUrl = (token: string, params: Record<string, string>) => {
  const query = new URLSearchParams(params);
  return `/sozlesme/${encodeURIComponent(token)}?${query.toString()}`;
};

const checked = (formData: FormData, key: string) => String(formData.get(key) ?? "") === "on";

export async function signContract(token: string, formData: FormData) {
  const signerName = String(formData.get("signer_name") ?? "").trim().slice(0, 180);
  const signatureData = String(formData.get("signature_data") ?? "").trim();

  if (signerName.length < 2) {
    redirect(contractUrl(token, { error: "missing" }));
  }

  if (!signatureData.startsWith("data:image/png;base64,") || signatureData.length < 200) {
    redirect(contractUrl(token, { error: "signature" }));
  }

  const supabase = await createClient();

  // İptal edilmiş, reddedilmiş veya zaten imzalanmış sözleşme imzalanamaz.
  // Eskiden müşteri eski linkten iptal edilmiş sözleşmeyi imzalayabiliyor,
  // bu da iş akışı ve ödeme planı oluşturuyordu.
  const { data: current } = await supabase.rpc("get_public_crm_contract", { public_token: token });
  const contract = Array.isArray(current) ? current[0] : current;
  if (!contract || contract.signed_at || !["draft", "sent"].includes(contract.status)) {
    redirect(contractUrl(token, { error: "closed" }));
  }

  // Zorunlu onay beyanları sunucuda doğrulanır (tarayıcıdaki "required"
  // tek başına yeterli değil). Tüketicide Ön Bilgilendirme Formu, tacirde
  // ticari işlem beyanı zorunludur; cayma süresinde ifaya başlama isteğe bağlı.
  const consumer = detectCustomerKind({ name: contract.customer_name, taxNumber: contract.customer_tax_number, taxOffice: contract.customer_tax_office }) === "consumer";
  const consents = {
    contract: checked(formData, "consent_contract"),
    kvkk: checked(formData, "consent_kvkk"),
    preinfo: consumer && checked(formData, "consent_preinfo"),
    commercial: !consumer && checked(formData, "consent_commercial"),
    early_start: consumer && checked(formData, "consent_early_start"),
    consumer,
  };
  if (!consents.contract || !consents.kvkk || (consumer ? !consents.preinfo : !consents.commercial)) {
    redirect(contractUrl(token, { error: "consent" }));
  }

  const requestHeaders = await headers();
  const signerIp = firstForwardedIp(requestHeaders.get("x-forwarded-for"))
    || requestHeaders.get("x-real-ip")
    || requestHeaders.get("cf-connecting-ip")
    || null;
  const signerUserAgent = requestHeaders.get("user-agent")?.slice(0, 1000) || null;

  const { data, error } = await supabase.rpc("sign_crm_contract_v2", {
    public_token: token,
    signer_name: signerName,
    signature_data: signatureData,
    signer_ip: signerIp,
    signer_user_agent: signerUserAgent,
  });

  if (error) {
    console.error("sign_crm_contract_v2 failed", { code: error.code, message: error.message });
    redirect(contractUrl(token, { error: "failed" }));
  }

  // Hangi yasal metin sürümünün ve hangi beyanların onaylandığı kaydedilir;
  // imzalı belge bu kayda göre onaylandığı metinle gösterilir.
  const { error: consentError } = await supabase.rpc("arvo_record_contract_consents", {
    public_token: token,
    p_legal_version: LEGAL_TEXT_VERSION,
    p_consents: consents,
  });
  if (consentError) {
    console.error("arvo_record_contract_consents failed", { code: consentError.code, message: consentError.message });
  }

  const row = Array.isArray(data) ? data[0] : data;
  redirect(contractUrl(token, {
    signed: "1",
    workflow: String(row?.workflow_id ?? ""),
  }));
}

// Ek protokol (iş planı ve ödeme takvimi) onayı ya da değişiklik talebi.
// Onayda ad soyad + onay kutusu, değişiklik talebinde gerekçe zorunlu;
// kararla birlikte tarih-saat, IP ve cihaz bilgisi kaydedilir.
export async function respondToAddendum(token: string, formData: FormData) {
  const addendumId = String(formData.get("addendum_id") ?? "").trim().slice(0, 80);
  const decision = String(formData.get("decision") ?? "");
  const responderName = String(formData.get("responder_name") ?? "").trim().slice(0, 180);
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  const back = (params: Record<string, string>) => `${contractUrl(token, params)}#ek-protokoller`;

  if (!addendumId || !["accept", "reject"].includes(decision)) redirect(back({ error: "addendum_failed" }));
  if (responderName.length < 2) redirect(back({ error: "addendum_name" }));
  if (decision === "accept" && !checked(formData, "consent")) redirect(back({ error: "addendum_consent" }));
  if (decision === "reject" && note.length < 3) redirect(back({ error: "addendum_note" }));

  const requestHeaders = await headers();
  const responderIp = firstForwardedIp(requestHeaders.get("x-forwarded-for"))
    || requestHeaders.get("x-real-ip")
    || requestHeaders.get("cf-connecting-ip")
    || null;
  const responderUserAgent = requestHeaders.get("user-agent")?.slice(0, 1000) || null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("arvo_respond_contract_addendum", {
    public_token: token,
    p_addendum_id: addendumId,
    p_decision: decision,
    p_name: responderName,
    p_note: note || null,
    p_ip: responderIp,
    p_user_agent: responderUserAgent,
  });
  if (error) {
    console.error("arvo_respond_contract_addendum failed", { code: error.code, message: error.message });
    redirect(back({ error: "addendum_failed" }));
  }

  const result = String(data ?? "");
  if (result === "accepted" || result === "rejected") redirect(back({ addendum: result }));
  const errorCodes: Record<string, string> = { closed: "addendum_closed", missing_name: "addendum_name", missing_note: "addendum_note" };
  redirect(back({ error: errorCodes[result] ?? "addendum_failed" }));
}
