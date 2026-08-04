"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

async function bankingContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "banking")) throw new Error("Banka modülüne erişiminiz yok.");
  if (!['owner','admin'].includes(context.membership.role)) throw new Error("Bu işlem için yönetici yetkisi gerekir.");
  return context;
}

export async function createBankAccount(formData: FormData) {
  const { supabase, membership, userId } = await bankingContext();
  const bankName = String(formData.get("bank_name") ?? "").trim();
  const accountName = String(formData.get("account_name") ?? "").trim();
  const iban = String(formData.get("iban") ?? "").replace(/\s+/g, "").toUpperCase();
  const openingBalance = Math.round(Number(formData.get("opening_balance") ?? 0) * 100);
  if (bankName.length < 2 || iban.length < 15) throw new Error("Banka adı ve geçerli IBAN zorunludur.");
  const { error } = await supabase.from("organization_bank_accounts").insert({
    organization_id: membership.organization_id, bank_name: bankName, account_name: accountName || null,
    iban, opening_balance: openingBalance, created_by: userId,
  });
  if (error) throw new Error("Banka hesabı eklenemedi: " + error.message);
  revalidatePath("/panel/finance"); revalidatePath("/panel/banking");
}

export async function createBankTransaction(formData: FormData) {
  const { supabase, membership, userId } = await bankingContext();
  const bankAccountId = String(formData.get("bank_account_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
  const description = String(formData.get("description") ?? "").trim();
  const referenceNo = String(formData.get("reference_no") ?? "").trim();
  const transactionDate = String(formData.get("transaction_date") ?? "") || new Date().toISOString().slice(0,10);
  if (!['inflow','outflow'].includes(direction) || !Number.isFinite(amount) || amount <= 0 || description.length < 2) throw new Error("Hareket bilgileri geçersiz.");
  const { error } = await supabase.from("bank_transactions").insert({
    organization_id: membership.organization_id, bank_account_id: bankAccountId, direction, amount,
    description, reference_no: referenceNo || null, transaction_date: transactionDate, created_by: userId,
  });
  if (error) throw new Error("Banka hareketi eklenemedi: " + error.message);
  revalidatePath("/panel/finance"); revalidatePath("/panel/banking");
}

export async function reconcileBankTransaction(formData: FormData) {
  const { supabase, membership } = await bankingContext();
  const transactionId = String(formData.get("transaction_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const invoiceId = String(formData.get("invoice_id") ?? "") || null;
  const partyId = String(formData.get("party_id") ?? "") || null;
  if (!['matched','unmatched','ignored'].includes(status)) throw new Error("Geçersiz mutabakat durumu.");
  const { error } = await supabase.from("bank_transactions").update({
    reconciliation_status: status,
    matched_invoice_id: status === 'matched' ? invoiceId : null,
    matched_party_id: status === 'matched' ? partyId : null,
    updated_at: new Date().toISOString(),
  }).eq("id", transactionId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Mutabakat güncellenemedi: " + error.message);
  revalidatePath("/panel/finance"); revalidatePath("/panel/banking");
}
