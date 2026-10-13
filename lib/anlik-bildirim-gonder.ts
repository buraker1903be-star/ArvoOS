import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AZAMI_HATA, cihazGittiMi, pushAdresiUygunMu, type PushYuku } from "@/lib/anlik-bildirim";

/*
  ANLIK BİLDİRİM GÖNDERİMİ (sunucu). Anahtarlar (VAPID) ortam
  değişkeninde; biri eksikse özellik KAPALI görünür, uygulama düşmez
  (AGENTS.md). Genel anahtar adı NEXT_PUBLIC_ ile başlamıyor: tarayıcıya
  sayfa üzerinden veriliyor, derlemeye gömülmüyor — anahtar değişince
  yeniden derleme gerekmesin.
*/
export const pushYapilandi = () =>
  Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

export const pushGenelAnahtar = () => process.env.VAPID_PUBLIC_KEY ?? null;

export type PushCihazi = { id: string; endpoint: string; p256dh: string; auth: string; failure_count: number };

let ayarlandi = false;
function ayarla() {
  if (ayarlandi) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT as string, process.env.VAPID_PUBLIC_KEY as string, process.env.VAPID_PRIVATE_KEY as string);
  ayarlandi = true;
}

/*
  Cihazlara gönderir; servisin "bu cihaz yok" dediği (404/410) kaydı
  siler, art arda AZAMI_HATA kez düşeni de bırakır. admin: service_role
  istemcisi — çağıran yetkiyi kendisi doğrulamış olmalı.
*/
export async function cihazlaraGonder(admin: SupabaseClient, cihazlar: PushCihazi[], yuk: PushYuku) {
  if (!pushYapilandi() || !cihazlar.length) return { gonderilen: 0, silinen: 0 };
  ayarla();
  const govde = JSON.stringify(yuk);
  let gonderilen = 0;
  const silinecek: string[] = [];
  await Promise.all(cihazlar.map(async (cihaz) => {
    // Kayıt anında denetlendi; burada yine bakılıyor (eski kayıtlar, elle eklenenler).
    if (!pushAdresiUygunMu(cihaz.endpoint)) { silinecek.push(cihaz.id); return; }
    try {
      await webpush.sendNotification({ endpoint: cihaz.endpoint, keys: { p256dh: cihaz.p256dh, auth: cihaz.auth } }, govde, { TTL: 60 * 60 * 24, urgency: "high", timeout: 8000 });
      gonderilen += 1;
      await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", cihaz.id);
    } catch (hata) {
      const kod = (hata as { statusCode?: number }).statusCode;
      if (cihazGittiMi(kod) || cihaz.failure_count + 1 >= AZAMI_HATA) silinecek.push(cihaz.id);
      else await admin.from("push_subscriptions").update({ failure_count: cihaz.failure_count + 1 }).eq("id", cihaz.id);
      console.error("[push] gönderilemedi", { kod, mesaj: (hata as Error).message?.slice(0, 200) });
    }
  }));
  if (silinecek.length) await admin.from("push_subscriptions").delete().in("id", silinecek);
  return { gonderilen, silinen: silinecek.length };
}
