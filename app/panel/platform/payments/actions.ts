"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

export async function reviewBankTransferPayment(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const reviewNote = String(formData.get("review_note") ?? "").trim().slice(0, 1000);

  if (!paymentId) throw new Error("Ödeme kaydı seçilmedi.");
  if (!new Set(["approved", "rejected"]).has(decision)) throw new Error("Geçersiz karar.");

  const { error } = await supabase.rpc("review_bank_transfer_payment", {
    p_payment_id: paymentId,
    p_decision: decision,
    p_review_note: reviewNote || null,
  });
  if (error) throw new Error(`Ödeme kararı kaydedilemedi: ${error.message}`);

  revalidatePath("/panel", "layout");
  revalidatePath("/panel/platform/payments");
  revalidatePath("/panel/platform/licenses");
  revalidatePath("/panel/platform/billing");
}
