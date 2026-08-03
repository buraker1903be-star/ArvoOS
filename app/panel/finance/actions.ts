"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const types = new Set(["income", "expense"]);
const statuses = new Set(["planned", "paid", "canceled"]);
const invoiceStatuses = new Set(["draft", "open", "paid", "void"]);

async function financeContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "finance")) throw new Error("Finans modülüne erişiminiz yok.");
  if (!context.isPlatformOwner && !["owner", "admin"].includes(context.membership.role)) throw new Error("Finans kayıtlarını yönetme yetkiniz yok.");
  return context;
}

export async function createFinanceTransaction(formData: FormData) {
  const { supabase, userId, membership } = await financeContext();
  const transactionType = String(formData.get("transaction_type") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const counterparty = String(formData.get("counterparty") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);

  if (!types.has(transactionType)) throw new Error("Geçersiz işlem türü.");
  if (title.length < 2 || title.length > 180) throw new Error("İşlem başlığı 2–180 karakter olmalı.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Tutar sıfırdan büyük olmalı.");

  const { error } = await supabase.from("finance_transactions").insert({
    organization_id: membership.organization_id,
    transaction_type: transactionType,
    status: "planned",
    title,
    counterparty: counterparty || null,
    category: category || null,
    amount,
    due_date: dueDate,
    notes: notes || null,
    created_by: userId,
  });
  if (error) throw new Error("Finans kaydı oluşturulamadı: " + error.message);
  revalidatePath("/panel/finance");
  revalidatePath("/panel");
}

export async function updateFinanceTransactionStatus(formData: FormData) {
  const { supabase, membership } = await financeContext();
  const transactionId = String(formData.get("transaction_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!statuses.has(status)) throw new Error("Geçersiz finans durumu.");

  const { error } = await supabase.from("finance_transactions").update({
    status,
    paid_at: status === "paid" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", transactionId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Finans kaydı güncellenemedi: " + error.message);
  revalidatePath("/panel/finance");
  revalidatePath("/panel");
}

export async function collectPaymentInstallment(formData: FormData) {
  const { supabase } = await financeContext();
  const installmentId = String(formData.get("installment_id") ?? "").trim();
  if (!installmentId) throw new Error("Taksit seçilemedi.");
  const { error } = await supabase.rpc("collect_payment_installment", { target_installment_id: installmentId });
  if (error) throw new Error("Tahsilat kaydedilemedi: " + error.message);
  revalidatePath("/panel/finance");
  revalidatePath("/panel/finance/payment-plans");
  revalidatePath("/panel/finance/accounts");
  revalidatePath("/panel/finance/invoices");
  revalidatePath("/panel");
}

export async function rebuildPaymentPlan(formData: FormData) {
  const { supabase } = await financeContext();
  const planId = String(formData.get("plan_id") ?? "").trim();
  const installmentCount = Number(formData.get("installment_count") ?? 0);
  const firstDueDate = String(formData.get("first_due_date") ?? "").trim();
  const intervalMonths = Number(formData.get("interval_months") ?? 1);

  if (!planId) throw new Error("Ödeme planı seçilemedi.");
  if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 36) throw new Error("Taksit sayısı 1–36 arasında olmalı.");
  if (!firstDueDate) throw new Error("İlk vade tarihi zorunludur.");
  if (!Number.isInteger(intervalMonths) || intervalMonths < 1 || intervalMonths > 12) throw new Error("Taksit aralığı 1–12 ay arasında olmalı.");

  const { error } = await supabase.rpc("rebuild_payment_plan_installments", {
    p_plan_id: planId,
    p_installment_count: installmentCount,
    p_first_due_date: firstDueDate,
    p_interval_months: intervalMonths,
  });
  if (error) {
    if (error.message.includes("payment_plan_has_paid_installments")) throw new Error("Tahsil edilmiş taksiti bulunan ödeme planı değiştirilemez.");
    throw new Error("Ödeme planı güncellenemedi: " + error.message);
  }
  revalidatePath("/panel/finance/payment-plans");
  revalidatePath("/panel/finance");
  revalidatePath("/panel");
}

export async function updateInvoiceStatus(formData: FormData) {
  const { supabase, membership } = await financeContext();
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!invoiceId) throw new Error("Fatura seçilemedi.");
  if (!invoiceStatuses.has(status)) throw new Error("Geçersiz fatura durumu.");

  const { error } = await supabase.from("billing_invoices").update({
    status,
    paid_at: status === "paid" ? new Date().toISOString() : null,
  }).eq("id", invoiceId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Fatura durumu güncellenemedi: " + error.message);
  revalidatePath("/panel/finance");
  revalidatePath("/panel/finance/invoices");
  revalidatePath("/panel");
}
