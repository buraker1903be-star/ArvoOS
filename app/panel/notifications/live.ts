"use client";

// Bildirimlerin canlı takibi (Supabase Realtime).
//
// Bildirim çekmecesi layout'ta her sayfada bulunduğu için abonelik orada,
// oturum boyunca bir kez kurulur (çalışma alanı değişimi tam sayfa yüklemesi
// olduğundan kapsam eskimez):
//   * notifications INSERT  -> rozet anında +1 ve "pop"; açık çekmece yenilenir
//   * notifications UPDATE  -> başka sekmede/cihazda okundu: kesin sayı sorulur
//   * notification_user_reads INSERT -> toplu bildirim başka yerde okundu: aynı
//   * bağlantı (yeniden) kurulunca, sekmeye dönünce (30 sn'den eskiyse),
//     internet geri gelince ve aynı tarayıcıdaki başka sekme okundu
//     işaretleyince (BroadcastChannel) kesin sayı yeniden sorulur.
// Olaylar kısa bir süre biriktirilir: "Tümünü okundu" yüzlerce satır
// yazdığında tek bir sorgu yapılır.
// Realtime kurulamazsa hiçbir şey bozulmaz: rozet sunucudan gelen sayıyla
// (sayfa değişimi / yenileme) ve sekmeye dönüşte güncellenir.
// Migration: supabase/migrations/20260912201000_notifications_realtime.sql

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchNotificationLiveScope } from "./actions";
import { countUnreadNotifications } from "./count";
import { receiveNotification, setNotificationUnread } from "./unread-store";

export type NotificationChange = { inserted: number };
/** true dönerse çağıran listeyi yeniledi (sayı da onunla gelir); sayı ayrıca sorulmaz. */
type OnChange = (change: NotificationChange) => boolean;
type Row = { audience?: string; user_id?: string | null; read_at?: string | null };
type Scope = { organizationId: string; userId: string; isPlatformOwner: boolean };

const TAB_CHANNEL = "arvo-notifications";
const FLUSH_DELAY = 450;
const FLUSH_MAX_WAIT = 2000;
const STALE_AFTER = 30_000;

let tabChannel: BroadcastChannel | null = null;

/** Bu sekmede okundu işaretlendi: aynı tarayıcıdaki diğer sekmeler sayıyı yeniden sorar. */
export function notifyNotificationTabs() {
  try {
    tabChannel?.postMessage("changed");
  } catch {
    /* kapalı kanal: sessiz geç */
  }
}

export function useLiveNotifications(onChange: OnChange) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let disposed = false;
    let client: ReturnType<typeof createClient> | null = null;
    let channel: RealtimeChannel | null = null;
    let scope: Scope | null = null;
    let timer = 0;
    let firstPendingAt = 0;
    let inserted = 0;
    let countRequest = 0;
    let lastSync = Date.now();

    const refreshCount = async () => {
      if (!client || !scope) return;
      const request = ++countRequest;
      try {
        const unread = await countUnreadNotifications({ supabase: client, ...scope });
        if (!disposed && request === countRequest) setNotificationUnread(unread);
      } catch {
        /* sessiz: rozet bir sonraki yenilemede düzelir */
      }
    };

    const flush = () => {
      timer = 0;
      firstPendingAt = 0;
      const change = { inserted };
      inserted = 0;
      lastSync = Date.now();
      if (!onChangeRef.current(change)) void refreshCount();
    };

    const schedule = () => {
      if (disposed) return;
      const now = Date.now();
      if (!firstPendingAt) firstPendingAt = now;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(flush, Math.max(0, Math.min(FLUSH_DELAY, firstPendingAt + FLUSH_MAX_WAIT - now)));
    };

    // RLS zaten yalnızca alıcıya gönderiyor; yine de kapsam dışını yok say
    const relevant = (row: Row) =>
      Boolean(scope) &&
      (scope!.isPlatformOwner ? row.audience === "founder" : row.audience === "organization" && (!row.user_id || row.user_id === scope!.userId));

    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastSync > STALE_AFTER) schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", schedule);

    let ownTabChannel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      ownTabChannel = new BroadcastChannel(TAB_CHANNEL);
      ownTabChannel.onmessage = () => schedule();
      tabChannel = ownTabChannel;
    }

    void (async () => {
      const result = await fetchNotificationLiveScope().catch(() => null);
      if (disposed || !result?.ok) return;
      scope = { organizationId: result.organizationId, userId: result.userId, isPlatformOwner: result.isPlatformOwner };
      try {
        client = createClient();
        const filter = scope.isPlatformOwner ? "audience=eq.founder" : `organization_id=eq.${scope.organizationId}`;
        let next = client
          .channel(`notifications-${scope.organizationId}-${scope.userId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, (payload) => {
            const row = payload.new as Row;
            if (!relevant(row)) return;
            if (!row.read_at) {
              inserted += 1;
              receiveNotification();
            }
            schedule();
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter }, (payload) => {
            if (relevant(payload.new as Row)) schedule();
          });
        if (!scope.isPlatformOwner) {
          next = next.on("postgres_changes", { event: "INSERT", schema: "public", table: "notification_user_reads", filter: `user_id=eq.${scope.userId}` }, () => schedule());
        }
        // İlk bağlantıda ve kopup yeniden bağlanınca aradaki değişiklikleri al
        channel = next.subscribe((status) => {
          if (status === "SUBSCRIBED") schedule();
        });
      } catch {
        /* Realtime yok: rozet sayfa yenilenince ve sekmeye dönünce güncellenir */
      }
    })();

    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", schedule);
      if (ownTabChannel) {
        ownTabChannel.close();
        if (tabChannel === ownTabChannel) tabChannel = null;
      }
      if (client && channel) void client.removeChannel(channel);
    };
  }, []);
}
