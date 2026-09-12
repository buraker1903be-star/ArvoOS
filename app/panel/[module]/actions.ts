"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

async function createCrmRequest__impl(formData: FormData) {
  const { supabase, userId, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");

  const title = String(formData.get("title") ?? "").trim();
  const customerName = String(formData.get("customer_name") ?? "").trim();
  if (title.length < 2 || customerName.length < 2) throw new Error("Talep ve müşteri adı zorunludur.");

  const value = Number(formData.get("estimated_value") ?? 0);
  const { error } = await supabase.from("crm_requests").insert({
    organization_id: membership.organization_id,
    created_by: userId,
    title,
    customer_name: customerName,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    estimated_value: Number.isFinite(value) && value >= 0 ? value : 0,
    status: "new",
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  if (error) throw new Error("Talep kaydedilemedi: " + error.message);
  revalidatePath("/panel");
  revalidatePath("/panel/crm");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function createCrmRequest(...args: Parameters<typeof createCrmRequest__impl>) {
  return runPanelAction(() => createCrmRequest__impl(...args), "Talep sisteme girildi");
}
