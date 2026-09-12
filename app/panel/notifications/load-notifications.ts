import type { SupabaseClient } from "@supabase/supabase-js";
import { describeNotifications, type DescribedNotification, type NotificationRow } from "./describe";

// Bildirim listesini yükler: /panel/notifications sayfası ve üst çubuktaki
// bildirim çekmecesi aynı sorguyu ve aynı metin kurgusunu (describe.ts)
// kullanır; ikisi arasında "sayfada var, çekmecede yok" farkı oluşmaz.

export type NotificationScope = {
  supabase: SupabaseClient;
  userId: string;
  organizationId: string;
  isPlatformOwner: boolean;
};

export async function loadNotifications({ supabase, userId, organizationId, isPlatformOwner }: NotificationScope, limit = 100): Promise<DescribedNotification[]> {
  let query = supabase
    .from("notifications")
    .select("id,title,message,category,action_url,user_id,read_at,created_at,metadata")
    .order("created_at", { ascending: false })
    .limit(limit);

  query = isPlatformOwner
    ? query.eq("audience", "founder")
    : query.eq("audience", "organization").eq("organization_id", organizationId).or(`user_id.is.null,user_id.eq.${userId}`);

  const [{ data, error }, { data: dismissedRows }, { data: readRows }] = await Promise.all([
    query,
    supabase.from("notification_user_dismissals").select("notification_id").eq("user_id", userId),
    supabase.from("notification_user_reads").select("notification_id,read_at").eq("user_id", userId),
  ]);
  if (error) throw new Error(`Bildirimler okunamadı: ${error.message}`);

  const dismissedIds = new Set((dismissedRows ?? []).map((row) => row.notification_id as string));
  // Toplu bildirimlerde (user_id boş) okundu bilgisi kişiye özel.
  const ownReadAt = new Map((readRows ?? []).map((row) => [row.notification_id as string, row.read_at as string]));
  const rows = ((data ?? []) as NotificationRow[])
    .map((item) => (!isPlatformOwner && !item.user_id ? { ...item, read_at: ownReadAt.get(item.id) ?? null } : item))
    .filter((item) => !dismissedIds.has(item.id));
  return describeNotifications(supabase, organizationId, rows);
}

/** Üst çubuk rozetiyle aynı hesap (layout.tsx) — tarayıcı da kullandığı için ayrı modülde. */
export { countUnreadNotifications } from "./count";
