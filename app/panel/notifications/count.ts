import type { SupabaseClient } from "@supabase/supabase-js";

// Okunmamış bildirim sayısı — üst çubuk rozetiyle (layout.tsx) aynı hesap,
// liste sınırından bağımsız. Hem sunucu (actions.ts) hem tarayıcı (live.ts)
// kullanır; tarayıcıda RLS aynı şekilde uygulanır.
// Hata olursa 0 dönmez, hata fırlatır: rozet sessizce sıfırlanmasın.

export async function countUnreadNotifications({ supabase, organizationId, isPlatformOwner }: { supabase: SupabaseClient; organizationId: string; isPlatformOwner: boolean }): Promise<number> {
  if (isPlatformOwner) {
    const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).eq("audience", "founder");
    if (error) throw new Error(`Bildirim sayısı okunamadı: ${error.message}`);
    return count ?? 0;
  }
  const { data, error } = await supabase.rpc("arvo_unread_notification_count", { p_organization_id: organizationId });
  if (error) throw new Error(`Bildirim sayısı okunamadı: ${error.message}`);
  return Number(data ?? 0);
}
