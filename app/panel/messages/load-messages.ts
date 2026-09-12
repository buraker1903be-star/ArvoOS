import type { SupabaseClient } from "@supabase/supabase-js";
import { CHANNEL_COLUMNS, toChannel, type ChannelRow, type MessagesInit } from "./messages-shared";

// Mesaj çekmecesi (layout) ve /panel/messages sayfası için ilk veri.
// Okunmamış sayısı artık sunucudaki arvo_message_unread_counts'tan gelir:
// eskiden tarayıcıdan son 1000 mesaj çekilip sayılıyordu (fazlası kayboluyor,
// okundu kaydı olmayan yeni kullanıcı tüm geçmişi okunmamış görüyordu).
export async function loadMessagesInit(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<MessagesInit> {
  const [{ data: employees }, { data: channelRows }, { data: presenceRows }, { data: unreadRows }] = await Promise.all([
    supabase
      .from("hr_employees")
      .select("user_id,full_name,job_title")
      .eq("organization_id", organizationId)
      .eq("employment_status", "active")
      .not("user_id", "is", null)
      .order("full_name"),
    supabase
      .from("message_channels")
      .select(CHANNEL_COLUMNS)
      .eq("organization_id", organizationId)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase.from("user_presence").select("user_id,last_seen_at").eq("organization_id", organizationId),
    supabase.rpc("arvo_message_unread_counts", { p_organization_id: organizationId }),
  ]);
  const lastSeen = new Map(((presenceRows ?? []) as { user_id: string; last_seen_at: string }[]).map((row) => [row.user_id, row.last_seen_at]));
  return {
    organizationId,
    userId,
    people: ((employees ?? []) as { user_id: string; full_name: string; job_title: string | null }[]).map((employee) => ({
      userId: employee.user_id,
      name: employee.full_name,
      jobTitle: employee.job_title,
      lastSeenAt: lastSeen.get(employee.user_id) ?? null,
    })),
    channels: ((channelRows ?? []) as ChannelRow[]).map(toChannel),
    unread: Object.fromEntries(((unreadRows ?? []) as { channel_id: string; unread: number }[]).map((row) => [row.channel_id, row.unread])),
  };
}
