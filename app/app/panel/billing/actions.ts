"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

const plans = new Set(["starter", "professional", "enterprise"]);
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function sanitizeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "dekont";
}

export async function submitBankTransferPayment(formData: FormData) {
  const { supabase, organization, membership } = await getPanelContext();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Ödeme bildirimi yalnızca kurum sahibi veya yöneticisi tarafından gönderilebilir.");
  }

  const bankAccountId = String(formData.get("bank_account_id") ?? "").trim();
  const planCode = String(formData.get("plan_code") ?? "").trim();
  const amountTl = Number(String(formData.get("amount") ?? "").replace(",", "."));
  const referenceNo = String(formData.get("reference_no") ?? "").trim().slice(0, 120);
  const customerNote = String(formData.get("customer_note") ?? "").trim().slice(0, 1000);
  const receipt = formData.get("receipt");

  if (!bankAccountId) throw new Error("Banka hesabı seçilmedi.");
  if (!plans.has(planCode)) throw new Error("Geçerli bir paket seçin.");
  if (!Number.isFinite(amountTl) || amountTl <= 0 || amountTl > 10000000) throw new Error("Geçerli bir ödeme tutarı girin.");
  if (!(receipt instanceof File) || receipt.size === 0) throw new Error("Dekont dosyası zorunludur.");
  if (!allowedTypes.has(receipt.type)) throw new Error("Dekont PDF, JPG, PNG veya WEBP olmalıdır.");
  if (receipt.size > 10 * 1024 * 1024) throw new Error("Dekont dosyası 10 MB sınırını aşıyor.");

  const { data: account, error: accountError } = await supabase
    .from("platform_bank_accounts")
    .select("id")
    .eq("id", bankAccountId)
    .eq("is_active", true)
    .maybeSingle();
  if (accountError || !account) throw new Error("Aktif banka hesabı bulunamadı.");

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Oturum doğrulanamadı.");

  const receiptPath = `${organization.id}/${userData.user.id}/${Date.now()}-${sanitizeFileName(receipt.name)}`;
  const { error: uploadError } = await supabase.storage.from("payment-receipts").upload(receiptPath, receipt, {
    contentType: receipt.type,
    upsert: false,
  });
  if (uploadError) throw new Error(`Dekont yüklenemedi: ${uploadError.message}`);

  const amount = Math.round(amountTl * 100);
  const { error: insertError } = await supabase.from("organization_payment_requests").insert({
    organization_id: organization.id,
    bank_account_id: bankAccountId,
    plan_code: planCode,
    amount,
    currency: "TRY",
    payment_method: "bank_transfer",
    receipt_path: receiptPath,
    reference_no: referenceNo || null,
    customer_note: customerNote || null,
    submitted_by: userData.user.id,
  });

  if (insertError) {
    await supabase.storage.from("payment-receipts").remove([receiptPath]);
    throw new Error(`Ödeme bildirimi kaydedilemedi: ${insertError.message}`);
  }

  revalidatePath("/panel/billing");
  redirect("/panel/billing?submitted=1");
}
