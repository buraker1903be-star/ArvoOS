import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AZAMI_HATA, cihazGittiMi, pushAdresiUygunMu, type PushYuku } from "@/lib/anlik-bildirim";
import { etkinYetkiler, gizliModulleriHesapla } from "@/lib/yetkiler";

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

/*
  POSTAYI GÖREBİLENLER — gönderim anında, panelin kullandığı aynı
  hesapla (lib/yetkiler.ts: rol + kişi kuralları, modül kapısı). Posta
  anahtarı açılırken de denetleniyor; burada yeniden bakılıyor çünkü
  anahtar açıldıktan sonra yetki alınmış ya da üyelik kapanmış olabilir
  ve bildirim gönderenin adını ve konuyu kilit ekranına yazıyor.
  Okunamayan kural "kısıt yok" sayılmaz: hata olursa kimseye gitmez.
*/
export async function postaGorenler(admin: SupabaseClient, orgId: string, kullanicilar: string[]): Promise<Set<string>> {
  const sonuc = new Set<string>();
  if (!kullanicilar.length) return sonuc;
  const { data: uyelikler, error } = await admin.from("organization_memberships")
    .select("user_id,role,is_active").eq("organization_id", orgId).in("user_id", kullanicilar);
  if (error) { console.error("[push] üyelikler okunamadı", error.message); return sonuc; }
  const etkin = (uyelikler ?? []).filter((u) => u.is_active) as { user_id: string; role: string }[];
  const roller = [...new Set(etkin.map((u) => u.role))];
  const [rm, km, ry, ky] = await Promise.all([
    admin.from("role_module_permissions").select("role,module_key,can_access").eq("organization_id", orgId).in("role", roller),
    admin.from("member_module_permissions").select("user_id,module_key,can_access").eq("organization_id", orgId).in("user_id", kullanicilar),
    admin.from("role_capability_permissions").select("role,capability_key,allowed").eq("organization_id", orgId).in("role", roller),
    admin.from("member_capability_permissions").select("user_id,capability_key,allowed").eq("organization_id", orgId).in("user_id", kullanicilar),
  ]);
  const hata = [rm, km, ry, ky].find((r) => r.error);
  if (hata?.error) { console.error("[push] yetki kuralları okunamadı", hata.error.message); return sonuc; }
  for (const u of etkin) {
    const gizli = gizliModulleriHesapla({
      rol: u.role,
      rolSatirlari: (rm.data ?? []).filter((r) => r.role === u.role),
      kisiSatirlari: (km.data ?? []).filter((r) => r.user_id === u.user_id),
    });
    const yetkiler = etkinYetkiler({
      rol: u.role,
      gizliModuller: gizli,
      rolKurallari: (ry.data ?? []).filter((r) => r.role === u.role),
      kisiKurallari: (ky.data ?? []).filter((r) => r.user_id === u.user_id),
    });
    if (yetkiler.has("posta.gor")) sonuc.add(u.user_id);
  }
  return sonuc;
}
