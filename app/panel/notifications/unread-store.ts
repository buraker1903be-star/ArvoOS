"use client";

import { useSyncExternalStore } from "react";

// Okunmamış bildirim sayısı: üst çubuk düğmesi, mobil alt menü ve menü
// çekmecesindeki rozetler aynı değeri gösterir. Başlangıç değeri sunucudan
// (layout.tsx) gelir; çekmece okundu işaretleyince anında düşer, liste
// yeniden yüklenince sunucudaki kesin sayıyla düzeltilir.

export const OPEN_NOTIFICATIONS_EVENT = "arvo:open-notifications";

let current: number | null = null;
const listeners = new Set<() => void>();

export function setNotificationUnread(value: number) {
  const next = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

export function getNotificationUnread(fallback = 0) {
  return current ?? fallback;
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

/** Bildirim çekmecesini herhangi bir bileşenden açar. */
export function openNotificationsDrawer() {
  window.dispatchEvent(new Event(OPEN_NOTIFICATIONS_EVENT));
}
