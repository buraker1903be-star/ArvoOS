"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

export async function markNotificationRead(formData: FormData) {
  const { supabase, userId } = await getPanelContext();
  const notificationId = String(formData.get("notification_id") ?? "").trim();
  if (!notificationId) throw new Error("Bildirim seçilmedi.");

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .or(`user_id.is.null,user_id.eq.${userId}`);

  if (error) throw new Error(`Bildirim güncellenemedi: ${error.message}`);
  revalidatePath("/panel/notifications");
}

export async function markAllNotificationsRead() {
  const { supabase, userId, organization, isPlatformOwner } = await getPanelContext();
  let query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);

  query = isPlatformOwner
    ? query.eq("audience", "founder")
    : query.eq("audience", "organization").eq("organization_id", organization.id).or(`user_id.is.null,user_id.eq.${userId}`);

  const { error } = await query;
  if (error) throw new Error(`Bildirimler güncellenemedi: ${error.message}`);
  revalidatePath("/panel/notifications");
}

export async function deleteReadNotification(formData: FormData) {
  const { supabase, userId } = await getPanelContext();
  const notificationId = String(formData.get("notification_id") ?? "").trim();
  if (!notificationId) throw new Error("Bildirim seçilmedi.");

  const { data: notification, error: notificationError } = await supabase
    .from("notifications")
    .select("id,read_at")
    .eq("id", notificationId)
    .not("read_at", "is", null)
    .maybeSingle();
  if (notificationError) throw new Error(`Bildirim doğrulanamadı: ${notificationError.message}`);
  if (!notification) throw new Error("Yalnızca okunmuş bildirimler silinebilir.");

  const { error } = await supabase.from("notification_user_dismissals").insert({
    notification_id: notificationId,
    user_id: userId,
  });
  if (error && error.code !== "23505") throw new Error(`Bildirim silinemedi: ${error.message}`);
  revalidatePath("/panel/notifications");
  revalidatePath("/panel");
}

export async function sendManagementAnnouncement(formData: FormData) {
  const { supabase, membership } = await getPanelContext();
  if (!["owner", "admin", "manager"].includes(membership.role)) throw new Error("Duyuru gönderme yetkiniz yok.");
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const recipient = String(formData.get("recipient_user_id") ?? "all");
  if (title.length < 3 || title.length > 120) throw new Error("Duyuru başlığı 3–120 karakter olmalı.");
  if (message.length < 3 || message.length > 2000) throw new Error("Duyuru metni 3–2000 karakter olmalı.");

  const { error } = await supabase.rpc("send_management_announcement", {
    p_organization_id: membership.organization_id,
    p_title: title,
    p_message: message,
    p_target_user_id: recipient === "all" ? null : recipient,
  });
  if (error) throw new Error(`Duyuru gönderilemedi: ${error.message}`);
  revalidatePath("/panel/notifications");
  revalidatePath("/panel");
}
