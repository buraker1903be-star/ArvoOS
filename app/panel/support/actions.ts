"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { konsolAlaniniDogrula } from "../platform/konsol-alani";
import { kurucuyaUyar } from "@/lib/kurucu-uyarisi";
import { KATEGORI_ADI } from "@/lib/destek-kuyrugu";

const categories = new Set(["general","technical","billing","feature"]);
const priorities = new Set(["low","normal","high","urgent"]);
const statuses = new Set(["open","in_progress","waiting_customer","resolved","closed"]);

async function createSupportTicket__impl(formData: FormData) {
  const { supabase, userId, membership, organization } = await getPanelContext();
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
  /* Acil ve yüksek öncelikli talep kurucuya anında e-postayla da gidiyor
     (lib/kurucu-uyarisi): eskiden yalnızca konsolun ziline düşüyordu.
     Normal ve düşük öncelik e-posta göndermiyor; her talep bir posta
     olursa kurucu postayı okumayı bırakır. Akışı düşürmez. */
  if (priority === "urgent" || priority === "high") {
    await kurucuyaUyar({
      baslik: `${priority === "urgent" ? "Acil" : "Yüksek öncelikli"} destek talebi: ${subject}`,
      satirlar: [["Kurum", organization.display_name || organization.name], ["Konu", subject], ["Kategori", KATEGORI_ADI[category] ?? category]],
      not: body.slice(0, 1500),
      yol: `/panel/platform/destek/${ticket.id}`,
      dugme: "Talebi aç",
    });
  }
  revalidatePath("/panel/support");
  revalidatePath("/panel/platform/destek", "layout");
}

async function replySupportTicket__impl(formData: FormData) {
  const { supabase, userId, membership, isPlatformOwner, konsolKapsami } = await getPanelContext();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 5000) throw new Error("Mesaj 1–5000 karakter olmalı.");
  const { data: ticket } = await supabase.from("support_tickets").select("id,organization_id").eq("id",ticketId).single();
  if (!ticket) throw new Error("Destek talebi bulunamadı.");
  if (!isPlatformOwner && ticket.organization_id !== membership.organization_id) throw new Error("Bu talebe erişiminiz yok.");
  /* Başka kurumun talebine kurucu olarak yanıt: konsolun Destek alanı (02.11.2026). */
  if (isPlatformOwner && ticket.organization_id !== membership.organization_id) konsolAlaniniDogrula(konsolKapsami, "destek");
  const { error } = await supabase.from("support_messages").insert({
    ticket_id: ticket.id, organization_id: ticket.organization_id, author_id: userId, body, is_staff: isPlatformOwner,
  });
  if (error) throw new Error("Yanıt gönderilemedi: " + error.message);
  revalidatePath("/panel/support");
  // Konsolun destek kuyruğu da aynı işlemi kullanıyor (app/panel/platform/destek).
  revalidatePath("/panel/platform/destek", "layout");
}

async function updateSupportTicketStatus__impl(formData: FormData) {
  const { supabase, isPlatformOwner, konsolKapsami } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Yalnızca platform yöneticisi durum değiştirebilir.");
  konsolAlaniniDogrula(konsolKapsami, "destek");
  const ticketId = String(formData.get("ticket_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!statuses.has(status)) throw new Error("Geçersiz durum.");
  const { error } = await supabase.from("support_tickets").update({
    status, resolved_at: status === "resolved" || status === "closed" ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  }).eq("id",ticketId);
  if (error) throw new Error("Durum güncellenemedi: " + error.message);
  revalidatePath("/panel/support");
  revalidatePath("/panel/platform/destek", "layout");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function createSupportTicket(...args: Parameters<typeof createSupportTicket__impl>) {
  return runPanelAction(() => createSupportTicket__impl(...args), "Destek talebi oluşturuldu");
}
export async function replySupportTicket(...args: Parameters<typeof replySupportTicket__impl>) {
  return runPanelAction(() => replySupportTicket__impl(...args), "Yanıtınız gönderildi");
}
export async function updateSupportTicketStatus(...args: Parameters<typeof updateSupportTicketStatus__impl>) {
  return runPanelAction(() => updateSupportTicketStatus__impl(...args));
}
