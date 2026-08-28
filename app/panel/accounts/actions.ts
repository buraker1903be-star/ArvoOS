"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

async function accountsContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "accounts")) throw new Error("Cari hesap modülüne erişiminiz yok.");
  if (!context.isPlatformOwner && !["owner","admin"].includes(context.membership.role)) throw new Error("Bu işlem için yönetici yetkisi gerekli.");
  return context;
}

async function getPartyLedger(partyId: string) {
  const context = await accountsContext();
  const { data: party, error } = await context.supabase.from("account_parties")
    .select("id,account_entries(entry_type,amount,source_type)")
    .eq("id", partyId).eq("organization_id", context.membership.organization_id).eq("is_active", true).maybeSingle();
  if (error || !party) throw new Error("Seçilen müşteri carisi bulunamadı.");
  const entries = party.account_entries ?? [];
  const debit = entries.filter((entry) => entry.entry_type === "debit").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const credit = entries.filter((entry) => entry.entry_type === "credit").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const refunds = entries.filter((entry) => entry.entry_type === "debit" && entry.source_type === "adjustment").reduce((sum, entry) => sum + Number(entry.amount), 0);
  return { ...context, debit, credit, refunds };
}

function revalidateLedger() {
  revalidatePath("/panel/finance");
  revalidatePath("/panel/hr/commissions");
  revalidatePath("/panel/reporting");
  revalidatePath("/panel");
}

export async function createCollection(formData: FormData) {
  const partyId = String(formData.get("party_id") ?? "").trim();
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
  if (!partyId || !Number.isFinite(amount) || amount <= 0) throw new Error("Geçerli bir tahsilat tutarı girin.");
  const { supabase, membership, userId, debit, credit } = await getPartyLedger(partyId);
  if (amount > debit - credit) throw new Error("Tahsilat açık cari bakiyesini aşamaz.");
  const { error } = await supabase.from("account_entries").insert({
    organization_id: membership.organization_id, party_id: partyId, entry_type: "credit", amount,
    source_type: "payment", reference_no: String(formData.get("reference_no") ?? "").trim() || `TAH:${crypto.randomUUID()}`,
    transaction_date: String(formData.get("transaction_date") ?? "") || new Date().toISOString().slice(0,10),
    description: String(formData.get("description") ?? "Müşteri tahsilatı").trim(), created_by: userId,
  });
  if (error) throw new Error("Tahsilat kaydedilemedi: " + error.message);
  revalidateLedger();
}

export async function createRefund(formData: FormData) {
  const partyId = String(formData.get("party_id") ?? "").trim();
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
  if (!partyId || !Number.isFinite(amount) || amount <= 0) throw new Error("Geçerli bir iade tutarı girin.");
  const { supabase, membership, userId, credit, refunds } = await getPartyLedger(partyId);
  if (amount > credit - refunds) throw new Error("İade tutarı net tahsilatı aşamaz.");
  const reason = String(formData.get("description") ?? "").trim();
  if (reason.length < 2 || reason.length > 500) throw new Error("İade nedeni 2–500 karakter olmalı.");
  const { error } = await supabase.from("account_entries").insert({
    organization_id: membership.organization_id, party_id: partyId, entry_type: "debit", amount,
    source_type: "adjustment", reference_no: String(formData.get("reference_no") ?? "").trim() || `IADE:${crypto.randomUUID()}`,
    transaction_date: String(formData.get("transaction_date") ?? "") || new Date().toISOString().slice(0,10),
    description: `Müşteri iadesi · ${reason}`, created_by: userId,
  });
  if (error) throw new Error("İade kaydedilemedi: " + error.message);
  revalidateLedger();
}

export async function createParty(formData: FormData) {
  const { supabase, userId, membership } = await accountsContext();
  const name = String(formData.get("name") ?? "").trim();
  const partyType = String(formData.get("party_type") ?? "customer");
  if (name.length < 2 || name.length > 180) throw new Error("Cari adı 2–180 karakter olmalı.");
  if (!["customer","supplier","both"].includes(partyType)) throw new Error("Geçersiz cari türü.");
  const { error } = await supabase.from("account_parties").insert({
    organization_id: membership.organization_id,
    party_type: partyType,
    name,
    tax_number: String(formData.get("tax_number") ?? "").trim() || null,
    tax_office: String(formData.get("tax_office") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    created_by: userId,
  });
  if (error) throw new Error("Cari kart oluşturulamadı: " + error.message);
  revalidatePath("/panel/finance"); revalidatePath("/panel/accounts");
}

export async function createEntry(formData: FormData) {
  const { supabase, userId, membership } = await accountsContext();
  const partyId = String(formData.get("party_id") ?? "");
  const entryType = String(formData.get("entry_type") ?? "debit");
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
  const description = String(formData.get("description") ?? "").trim();
  if (!["debit","credit"].includes(entryType)) throw new Error("Geçersiz hareket türü.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Tutar sıfırdan büyük olmalı.");
  if (description.length < 2 || description.length > 500) throw new Error("Açıklama 2–500 karakter olmalı.");
  const { data: party, error: partyError } = await supabase.from("account_parties").select("id").eq("id", partyId).eq("organization_id", membership.organization_id).eq("is_active", true).maybeSingle();
  if (partyError || !party) throw new Error("Seçilen cari bu kuruma ait değil veya pasif.");
  const { error } = await supabase.from("account_entries").insert({
    organization_id: membership.organization_id,
    party_id: partyId,
    entry_type: entryType,
    amount,
    description,
    reference_no: String(formData.get("reference_no") ?? "").trim() || null,
    transaction_date: String(formData.get("transaction_date") ?? "") || new Date().toISOString().slice(0,10),
    due_date: String(formData.get("due_date") ?? "") || null,
    created_by: userId,
  });
  if (error) throw new Error("Cari hareket eklenemedi: " + error.message);
  revalidatePath("/panel/finance"); revalidatePath("/panel/accounts"); revalidatePath("/panel/hr/commissions");
}

export async function updateEntry(formData: FormData) {
  const { supabase, membership } = await accountsContext();
  const entryId = String(formData.get("entry_id") ?? "").trim();
  const partyId = String(formData.get("party_id") ?? "").trim();
  const entryType = String(formData.get("entry_type") ?? "debit");
  const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
  const description = String(formData.get("description") ?? "").trim();
  if (!entryId) throw new Error("Hareket seçilmedi.");
  if (!["debit", "credit"].includes(entryType)) throw new Error("Geçersiz hareket türü.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Tutar sıfırdan büyük olmalı.");
  if (description.length < 2 || description.length > 500) throw new Error("Açıklama 2–500 karakter olmalı.");
  const { error } = await supabase.from("account_entries").update({
    entry_type: entryType,
    amount,
    description,
    reference_no: String(formData.get("reference_no") ?? "").trim() || null,
    transaction_date: String(formData.get("transaction_date") ?? "") || undefined,
    due_date: String(formData.get("due_date") ?? "") || null,
  }).eq("id", entryId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Cari hareket güncellenemedi: " + error.message);
  revalidatePath("/panel/finance"); revalidatePath("/panel/accounts");
  revalidatePath(`/panel/accounts/${partyId}`); revalidatePath("/panel/hr/commissions");
}

export async function deleteEntry(formData: FormData) {
  const { supabase, membership } = await accountsContext();
  const entryId = String(formData.get("entry_id") ?? "").trim();
  const partyId = String(formData.get("party_id") ?? "").trim();
  if (!entryId) throw new Error("Hareket seçilmedi.");
  const { error } = await supabase.from("account_entries").delete().eq("id", entryId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Cari hareket silinemedi: " + error.message);
  revalidatePath("/panel/finance"); revalidatePath("/panel/accounts");
  revalidatePath(`/panel/accounts/${partyId}`); revalidatePath("/panel/hr/commissions");
}
