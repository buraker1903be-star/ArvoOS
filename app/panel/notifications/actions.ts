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
