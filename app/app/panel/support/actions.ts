"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const categories = new Set(["general","technical","billing","feature"]);
const priorities = new Set(["low","normal","high","urgent"]);
const statuses = new Set(["open","in_progress","waiting_customer","resolved","closed"]);

export async function createSupportTicket(formData: FormData) {
  const { supabase, userId, membership } = await getPanelContext();
  const subject = String(formData.get("subject") ?? "").trim();
  const category = String(formData.get("category") ?? "general");
  const priority = String(formData.get("priority") ?? "normal");
  const body = String(formData.get("body") ?? "").trim();
  if (subject.length < 3 || subject.length > 180) throw new Error("Konu 3–180 karakter olmalı.");
  if (!categories.has(category) || !priorities.has(priority)) throw new Error("Geçersiz destek talebi alanı.");
  if (!body || body.length > 5000) throw new Error("Mesaj 1–5000 karakter olmalı.");

  const { data: ticket, error } = await supabase.from("support_tickets").insert({
    organization_id: membership.organization_id, created_by: userId, subject, category, priority,
  }).select("id").single();
  if (error || !ticket) throw new Error("Destek talebi oluşturulamadı: " + (error?.message ?? "Bilinmeyen hata"));
  const { error: messageError } = await supabase.from("support_messages").insert({
    ticket_id: ticket.id, organization_id: membership.organization_id, author_id: userId, body, is_staff: false,
  });
  if (messageError) throw new Error("İlk mesaj eklenemedi: " + messageError.message);
  revalidatePath("/panel/support");
}

export async function replySupportTicket(formData: FormData) {
  const { supabase, userId, membership, isPlatformOwner } = await getPanelContext();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 5000) throw new Error("Mesaj 1–5000 karakter olmalı.");
  const { data: ticket } = await supabase.from("support_tickets").select("id,organization_id").eq("id",ticketId).single();
  if (!ticket) throw new Error("Destek talebi bulunamadı.");
  if (!isPlatformOwner && ticket.organization_id !== membership.organization_id) throw new Error("Bu talebe erişiminiz yok.");
  const { error } = await supabase.from("support_messages").insert({
    ticket_id: ticket.id, organization_id: ticket.organization_id, author_id: userId, body, is_staff: isPlatformOwner,
  });
  if (error) throw new Error("Yanıt gönderilemedi: " + error.message);
  revalidatePath("/panel/support");
}

export async function updateSupportTicketStatus(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Yalnızca platform yöneticisi durum değiştirebilir.");
  const ticketId = String(formData.get("ticket_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!statuses.has(status)) throw new Error("Geçersiz durum.");
  const { error } = await supabase.from("support_tickets").update({
    status, resolved_at: status === "resolved" || status === "closed" ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  }).eq("id",ticketId);
  if (error) throw new Error("Durum güncellenemedi: " + error.message);
  revalidatePath("/panel/support");
}