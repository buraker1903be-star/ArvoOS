"use client";

// Yeni mesaj uyarıları: kısa bir zil sesi ve (sekme arka plandayken)
// tarayıcı bildirimi. Ses dosyası yok; Web Audio ile iki yumuşak nota
// üretilir. Tercih bu tarayıcıda saklanır (localStorage).

const SOUND_KEY = "arvo.messages.sound";
const CHANGE_EVENT = "arvo:message-alert-settings";
let audio: AudioContext | null = null;
let lastAlertAt = 0;

export function soundEnabled() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* depolama kapalıysa yalnızca bu oturum için */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  if (on) playChime(true);
}

/** Ayar değişikliklerini dinler (useSyncExternalStore için). */
export function subscribeAlertSettings(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

export async function requestNotificationPermission() {
  if (notificationPermission() === "unsupported") return "unsupported";
  const result = await Notification.requestPermission();
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return result;
}

export function playChime(force = false) {
  if (!force && !soundEnabled()) return;
  try {
    const AudioCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    audio ??= new AudioCtor();
    const ctx = audio;
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime + 0.01;
    // İki nota: E6 → A6, hızlı yükselip yavaşça sönen
    for (const [frequency, delay] of [[1318.5, 0], [1760, 0.12]] as const) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + delay);
      gain.gain.exponentialRampToValueAtTime(0.09, start + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.38);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start + delay);
      oscillator.stop(start + delay + 0.4);
    }
  } catch {
    /* tarayıcı sesi engellediyse sessiz geç */
  }
}

/** Okunmamış sayılan yeni mesaj geldiğinde çağrılır. */
export function alertIncoming({ title, body, tag }: { title: string; body: string; tag: string }) {
  const now = Date.now();
  // Art arda gelen mesajlarda ses üst üste binmesin
  if (now - lastAlertAt > 1500) playChime();
  lastAlertAt = now;
  if (document.visibilityState === "visible") return; // sayfa önündeyken ses + rozet yeterli
  if (notificationPermission() !== "granted") return;
  try {
    const notification = new Notification(title, { body: body.slice(0, 180), tag, icon: "/favicon.svg" });
    notification.onclick = () => {
      window.focus();
      window.dispatchEvent(new Event("arvo:open-messages"));
      notification.close();
    };
  } catch {
    /* bazı tarayıcılar yalnızca service worker ile bildirim gösterir */
  }
}
