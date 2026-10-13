/*
  ANLIK BİLDİRİM (web push) — saf kurallar. Gönderim
  app/api/push/gonder/route.ts'de, kayıt app/panel/notifications/
  anlik-actions.ts'de.
*/

/*
  CİHAZ ADRESİ YALNIZCA BİLİNEN PUSH SERVİSLERİNDEN. Adresi tarayıcı
  veriyor, yani kullanıcıdan geliyor; sunucu her bildirimde o adrese
  POST atıyor. Sınırsız bırakılsa panele giren biri sunucumuza kendi
  seçtiği bir adrese (iç ağdaki bir servise) istek attırabilirdi
  (AGENTS.md: "sunucunun indireceği adres kullanıcıdan geliyorsa genel
  olmalı"). Tarayıcıların push servisleri belli ve az.
*/
const PUSH_SERVISLERI = [
  "fcm.googleapis.com", // Chrome, Edge, Android, Samsung
  "updates.push.services.mozilla.com", // Firefox
  "push.services.mozilla.com",
  "web.push.apple.com", // Safari (macOS, iOS ana ekran uygulaması)
];
const PUSH_SERVIS_SONEKLERI = [".push.apple.com", ".notify.windows.com"];

export function pushAdresiUygunMu(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  if (endpoint.length > 1000) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVISLERI.includes(host) || PUSH_SERVIS_SONEKLERI.some((sonek) => host.endsWith(sonek));
}

export type PushYuku = { baslik: string; metin: string; adres: string; etiket: string };

/*
  Bildirim satırından cihaza gidecek yük. Kilit ekranında görünecek:
  kısa tutulur (iOS ~4 satır gösteriyor; yük 4 KB'ı aşarsa servis
  reddediyor). Adres yalnızca panel içi bir yol olabilir — dokununca
  başka bir siteye götüren bildirim, sahte bildirimin ilk adımı.
*/
export function bildirimYuku(satir: { id: string; title: string | null; message: string | null; action_url: string | null; category: string | null }): PushYuku {
  const kisalt = (metin: string, sinir: number) => (metin.length > sinir ? `${metin.slice(0, sinir - 1).trimEnd()}…` : metin);
  const adres = satir.action_url && /^\/(?!\/)/.test(satir.action_url) && !satir.action_url.includes("\\")
    ? satir.action_url
    : "/panel/notifications";
  return {
    baslik: kisalt((satir.title ?? "").trim() || "Yeni bildirim", 80),
    metin: kisalt((satir.message ?? "").trim(), 240),
    adres,
    // Aynı bildirim iki kez gelirse (yeniden deneme) telefonda tek kalır.
    etiket: `arvo-${satir.id}`,
  };
}

/** Push servisi bu yanıtla "bu cihaz artık yok" diyor: kayıt silinir. */
export const cihazGittiMi = (durumKodu: number | undefined) => durumKodu === 404 || durumKodu === 410;

/** Art arda bu kadar başarısız gönderimden sonra cihaz kaydı bırakılır. */
export const AZAMI_HATA = 5;
