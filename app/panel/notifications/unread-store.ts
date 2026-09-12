"use client";

import { useSyncExternalStore } from "react";

// Okunmamış bildirim sayısı: üst çubuk düğmesi, mobil alt menü ve menü
// çekmecesindeki rozetler aynı değeri gösterir. Başlangıç değeri sunucudan
// (layout.tsx) gelir; yeni bildirim canlı olarak gelince (live.ts) anında
// artar, çekmece okundu işaretleyince anında düşer, ardından veritabanındaki
// kesin sayıyla düzeltilir.

export const OPEN_NOTIFICATIONS_EVENT = "arvo:open-notifications";

let current: number | null = null;
// Yeni bildirim sayacı: rozetler bu değer değişince "pop" animasyonunu oynatır
let arrivals = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

export function setNotificationUnread(value: number) {
  const next = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  if (next === current) return;
  current = next;
  emit();
}

export function getNotificationUnread(fallback = 0) {
  return current ?? fallback;
}

/** Yeni (okunmamış) bildirim geldi: sayıyı bir artırır ve rozetleri canlandırır. */
export function receiveNotification() {
  current = (current ?? 0) + 1;
  arrivals += 1;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNotificationUnread(fallback: number) {
  return useSyncExternalStore(subscribe, () => current ?? fallback, () => fallback);
}

/** Rozetin `key` değeri: yeni bildirimde değişir, rozet yeniden çizilip "pop" oynar (0 = animasyon yok). */
export function useNotificationArrivals() {
  return useSyncExternalStore(subscribe, () => arrivals, () => 0);
}

/** Bildirim çekmecesini herhangi bir bileşenden açar. */
export function openNotificationsDrawer() {
  window.dispatchEvent(new Event(OPEN_NOTIFICATIONS_EVENT));
}
