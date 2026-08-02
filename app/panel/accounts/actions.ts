"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

async function accountsContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "accounts")) throw new Error("Cari hesap modülüne erişiminiz yok.");
  if (!context.isPlatformOwner && !["owner","admin"].includes(context.membership.role)) throw new Error("Bu işlem için yönetici yetkisi gerekli.");
  return context;
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
  revalidatePath("/panel/accounts");
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
  revalidatePath("/panel/accounts");
}