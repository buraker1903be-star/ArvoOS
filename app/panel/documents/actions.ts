"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const text = (formData: FormData, key: string, max = 500) => String(formData.get(key) ?? "").trim().slice(0, max);

export async function createDocument(formData: FormData) {
  const { supabase, membership, userId } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Bu işlem için yönetici yetkisi gerekir.");
  const title = text(formData, "title", 180);
  if (title.length < 2) throw new Error("Belge adı en az 2 karakter olmalıdır.");
  const { error } = await supabase.from("organization_documents").insert({
    organization_id: membership.organization_id,
    title,
    category: text(formData, "category", 30) || "general",
    status: "active",
    external_url: text(formData, "external_url", 500) || null,
    notes: text(formData, "notes", 1500) || null,
    created_by: userId,
  });
  if (error) throw new Error("Belge kaydedilemedi: " + error.message);
  revalidatePath("/panel/documents");
}

export async function updateDocumentStatus(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Bu işlem için yönetici yetkisi gerekir.");
  const id = text(formData, "id", 80);
  const status = text(formData, "status", 20);
  if (!id || !["draft", "active", "archived"].includes(status)) throw new Error("Geçersiz belge işlemi.");
  const { error } = await supabase.from("organization_documents").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Belge güncellenemedi: " + error.message);
  revalidatePath("/panel/documents");
}
