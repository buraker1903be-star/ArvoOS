"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { toFeedItem, type NotificationFeedResult } from "./feed";
import { countUnreadNotifications, loadNotifications } from "./load-notifications";

// Toplu bildirimlerde (user_id boş) okundu bilgisi kişiye özel ve
// notification_user_reads tablosunda tutulur; eskiden bildirimin kendi
// read_at alanı güncelleniyor ve bir kişi okuyunca herkes için okunmuş
// oluyordu. Kişisel ve kurucu bildirimleri kendi read_at alanını kullanır.

function revalidateNotifications() {
  revalidatePath("/panel/notifications");
  revalidatePath("/panel");
}

async function markNotificationRead__impl(formData: FormData) {
  const { supabase, userId } = await getPanelContext();
  const notificationId = String(formData.get("notification_id") ?? "").trim();
  if (!notificationId) throw new Error("Bildirim seçilmedi.");

  const { data: notification, error: readError } = await supabase
    .from("notifications")
    .select("id,audience,user_id")
    .eq("id", notificationId)
    .maybeSingle();
  if (readError) throw new Error(`Bildirim okunamadı: ${readError.message}`);
  if (!notification) throw new Error("Bildirim bulunamadı.");

  if (notification.audience === "organization" && !notification.user_id) {
    const { error } = await supabase
      .from("notification_user_reads")
      .insert({ notification_id: notificationId, user_id: userId });
    if (error && error.code !== "23505") throw new Error(`Bildirim güncellenemedi: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId);
    if (error) throw new Error(`Bildirim güncellenemedi: ${error.message}`);
  }
  revalidateNotifications();
}

async function markAllNotificationsRead__impl() {
  const { supabase, userId, organization, isPlatformOwner } = await getPanelContext();
  const now = new Date().toISOString();

  if (isPlatformOwner) {
    const { error } = await supabase.from("notifications")
      .update({ read_at: now })
      .is("read_at", null)
      .eq("audience", "founder");
    if (error) throw new Error(`Bildirimler güncellenemedi: ${error.message}`);
    revalidateNotifications();
    return;
  }

  const { error: personalError } = await supabase.from("notifications")
    .update({ read_at: now })
    .is("read_at", null)
    .eq("audience", "organization")
    .eq("organization_id", organization.id)
    .eq("user_id", userId);
  if (personalError) throw new Error(`Bildirimler güncellenemedi: ${personalError.message}`);

  const { data: broadcasts, error: broadcastError } = await supabase.from("notifications")
    .select("id")
    .eq("audience", "organization")
    .eq("organization_id", organization.id)
    .is("user_id", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (broadcastError) throw new Error(`Bildirimler okunamadı: ${broadcastError.message}`);
  if (broadcasts?.length) {
    const { error } = await supabase.from("notification_user_reads").upsert(
      broadcasts.map((item) => ({ notification_id: item.id, user_id: userId, read_at: now })),
      { onConflict: "notification_id,user_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Bildirimler güncellenemedi: ${error.message}`);
  }
  revalidateNotifications();
}

async function deleteReadNotification__impl(formData: FormData) {
  const { supabase, userId } = await getPanelContext();
  const notificationId = String(formData.get("notification_id") ?? "").trim();
  if (!notificationId) throw new Error("Bildirim seçilmedi.");

  const [{ data: notification, error: notificationError }, { data: ownRead }] = await Promise.all([
    supabase.from("notifications").select("id,audience,user_id,read_at").eq("id", notificationId).maybeSingle(),
    supabase.from("notification_user_reads").select("notification_id").eq("notification_id", notificationId).eq("user_id", userId).maybeSingle(),
  ]);
  if (notificationError) throw new Error(`Bildirim doğrulanamadı: ${notificationError.message}`);
  const isBroadcast = notification?.audience === "organization" && !notification.user_id;
  const isRead = isBroadcast ? Boolean(ownRead) : Boolean(notification?.read_at);
  if (!notification || !isRead) throw new Error("Yalnızca okunmuş bildirimler silinebilir.");

  const { error } = await supabase.from("notification_user_dismissals").insert({
    notification_id: notificationId,
    user_id: userId,
  });
  if (error && error.code !== "23505") throw new Error(`Bildirim silinemedi: ${error.message}`);
  revalidateNotifications();
}

async function sendManagementAnnouncement__impl(formData: FormData) {
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
  revalidateNotifications();
}

// ---------- Bildirim çekmecesi (app/panel/notifications-drawer.tsx) ----------
// Çekmece işlemleri form göndermez; FlashToast çerez bildirimini ancak form
// gönderiminde ya da sayfa değişiminde okuyor. Bu yüzden sonuç çağırana
// döner ve hata çekmecenin içinde gösterilir. Okundu işlemleri yukarıdaki
// aynı kodu çalıştırır (kişiye özel okundu bilgisi dahil).

const errorText = (error: unknown) => (error instanceof Error && error.message ? error.message : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

export async function fetchNotificationFeed(): Promise<NotificationFeedResult> {
  try {
    const { supabase, userId, organization, isPlatformOwner } = await getPanelContext();
    const scope = { supabase, userId, organizationId: organization.id, isPlatformOwner };
    // Sayı okunamazsa liste yine gösterilir; rozet eski değerinde kalır (0'a düşmez)
    const [items, unread] = await Promise.all([loadNotifications(scope, 60), countUnreadNotifications(scope).catch(() => null)]);
    return { ok: true, items: items.map(toFeedItem), unread };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}

/** Canlı bildirim aboneliğinin kapsamı (live.ts): etkin çalışma alanı ve kullanıcı. */
export async function fetchNotificationLiveScope(): Promise<{ ok: true; userId: string; organizationId: string; isPlatformOwner: boolean } | { ok: false }> {
  try {
    const { userId, organization, isPlatformOwner } = await getPanelContext();
    return { ok: true, userId, organizationId: organization.id, isPlatformOwner };
  } catch {
    return { ok: false };
  }
}

export async function markNotificationReadFromDrawer(notificationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const formData = new FormData();
    formData.set("notification_id", notificationId);
    await markNotificationRead__impl(formData);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}

export async function markAllNotificationsReadFromDrawer(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await markAllNotificationsRead__impl();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function markNotificationRead(...args: Parameters<typeof markNotificationRead__impl>) {
  return runPanelAction(() => markNotificationRead__impl(...args));
}
export async function markAllNotificationsRead(...args: Parameters<typeof markAllNotificationsRead__impl>) {
  return runPanelAction(() => markAllNotificationsRead__impl(...args));
}
export async function deleteReadNotification(...args: Parameters<typeof deleteReadNotification__impl>) {
  return runPanelAction(() => deleteReadNotification__impl(...args));
}
export async function sendManagementAnnouncement(...args: Parameters<typeof sendManagementAnnouncement__impl>) {
  return runPanelAction(() => sendManagementAnnouncement__impl(...args), "Duyuru gönderildi");
}
