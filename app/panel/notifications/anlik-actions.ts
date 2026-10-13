"use server";

import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushAdresiUygunMu } from "@/lib/anlik-bildirim";
import { organizationBrandName } from "@/lib/customer-message-templates";
import { cihazlaraGonder, pushYapilandi, type PushCihazi } from "@/lib/anlik-bildirim-gonder";

/*
  BU CİHAZDA ANLIK BİLDİRİM (20261013071812). Tablo istemciye kapalı;
  kayıt burada OTURUMDAKİ kişiye ve kuruma bağlanıyor (service_role,
  yetki = oturum: herkes yalnızca kendi cihazını açıp kapatabilir).

  Dönüş düz nesne, runPanelAction değil: düğme sonucu kendi yerinde
  yazıyor ("Açıldı", "Bu tarayıcı desteklemiyor"…); çerezli bildirim
  burada ikinci bir ses olurdu.
*/
type Sonuc = { ok: true } | { ok: false; hata: string };

const KAPALI = "Anlık bildirim bu kurulumda henüz açılmadı (sunucu anahtarları tanımlı değil).";

export async function anlikBildirimAc(abonelik: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }, cihaz: string): Promise<Sonuc> {
  if (!pushYapilandi()) return { ok: false, hata: KAPALI };
  const { userId, membership } = await getPanelContext();
  const admin = createAdminClient();
  if (!admin) return { ok: false, hata: KAPALI };

  const endpoint = typeof abonelik?.endpoint === "string" ? abonelik.endpoint : "";
  const p256dh = typeof abonelik?.keys?.p256dh === "string" ? abonelik.keys.p256dh : "";
  const auth = typeof abonelik?.keys?.auth === "string" ? abonelik.keys.auth : "";
  if (!pushAdresiUygunMu(endpoint)) return { ok: false, hata: "Bu tarayıcının bildirim servisi tanınmadı." };
  if (p256dh.length < 20 || p256dh.length > 200 || auth.length < 8 || auth.length > 100) return { ok: false, hata: "Bildirim anahtarı geçersiz." };

  /*
    Aynı cihaz (aynı adres) başka bir kişiyle kayıtlıysa yeni kişiye
    geçer: ortak telefonda önceki kullanıcının bildirimleri sonrakine
    düşmesin. Bir kişinin en çok 10 cihazı tutulur (eskiler silinir).
  */
  const { error } = await admin.from("push_subscriptions").upsert({
    organization_id: membership.organization_id,
    user_id: userId,
    endpoint, p256dh, auth,
    cihaz: cihaz.slice(0, 200) || null,
    failure_count: 0,
  }, { onConflict: "endpoint" });
  if (error) return { ok: false, hata: "Cihaz kaydedilemedi: " + error.message };

  const { data: fazla } = await admin.from("push_subscriptions").select("id")
    .eq("user_id", userId).order("created_at", { ascending: false }).range(10, 100);
  if (fazla?.length) await admin.from("push_subscriptions").delete().in("id", fazla.map((s) => s.id));
  return { ok: true };
}

export async function anlikBildirimKapat(endpoint: string): Promise<Sonuc> {
  const { userId } = await getPanelContext();
  const admin = createAdminClient();
  if (!admin) return { ok: false, hata: KAPALI };
  // Yalnızca kendi kaydı: başka birinin cihazını adresini bilse de kapatamaz.
  const { error } = await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", userId);
  if (error) return { ok: false, hata: "Kapatılamadı: " + error.message };
  return { ok: true };
}

/*
  "Deneme gönder": kişinin bu kurumdaki BÜTÜN cihazlarına, bildirim kaydı
  açmadan. Eskiden yalnızca düğmeye basılan cihaza gidiyordu: kurum
  sahibi masaüstünden basıp telefonunu bekledi (13.10.2026).
*/
export async function anlikBildirimDene(): Promise<{ ok: true; gonderilen: number; toplam: number } | { ok: false; hata: string }> {
  if (!pushYapilandi()) return { ok: false, hata: KAPALI };
  const { userId, organization, membership } = await getPanelContext();
  const admin = createAdminClient();
  if (!admin) return { ok: false, hata: KAPALI };
  const { data, error } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth,failure_count")
    .eq("user_id", userId).eq("organization_id", membership.organization_id);
  if (error) return { ok: false, hata: "Cihazlar okunamadı: " + error.message };
  if (!data?.length) return { ok: false, hata: "Kayıtlı cihazınız yok; önce bildirimleri açın." };
  const { gonderilen } = await cihazlaraGonder(admin, data as PushCihazi[], {
    // Kurumun kendi adı: AkademikMerkez kullanıcısının kilit ekranında "ArvoOS" yazıyordu.
    baslik: `${organizationBrandName({ slug: organization.slug, displayName: organization.display_name, legalName: organization.name })} bildirimleri açık`,
    metin: "İş atandığında, müşteri yazdığında ve size yorum geldiğinde burada haber vereceğiz.",
    adres: "/panel/notifications",
    etiket: "arvo-deneme",
  });
  return gonderilen ? { ok: true, gonderilen, toplam: data.length } : { ok: false, hata: "Deneme gönderilemedi; cihaz kaydı yenilenmeli. Kapatıp yeniden açın." };
}

/*
  Bu cihazın sunucudaki kaydı: kayıtlı mı, gelen posta açık mı. Tarayıcı
  aboneliği tutup sunucu satırı yoksa (kayıt sırasında migration eksikti,
  cihaz 404/410 ile silindi) kart "Açık" görünüp hiçbir şey gelmiyordu;
  kart bunu okuyup kaydı yeniler.
*/
export async function anlikBildirimDurumu(endpoint: string): Promise<{ kayitli: boolean; posta: boolean; postaGorur: boolean }> {
  const { userId, izin } = await getPanelContext();
  const admin = createAdminClient();
  const postaGorur = izin("posta.gor");
  if (!admin || !pushYapilandi()) return { kayitli: false, posta: false, postaGorur };
  const { data } = await admin.from("push_subscriptions").select("posta").eq("endpoint", endpoint).eq("user_id", userId).maybeSingle();
  return { kayitli: Boolean(data), posta: Boolean(data?.posta), postaGorur };
}

/** "Gelen postaları da bildir" (20261013081415): yalnızca postayı görebilen açabilir. */
export async function anlikBildirimPosta(endpoint: string, acik: boolean): Promise<Sonuc> {
  const { userId, izin } = await getPanelContext();
  if (acik && !izin("posta.gor")) return { ok: false, hata: "Ortak posta kutusunu görme yetkiniz yok." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, hata: KAPALI };
  const { data, error } = await admin.from("push_subscriptions").update({ posta: acik })
    .eq("endpoint", endpoint).eq("user_id", userId).select("id");
  if (error) return { ok: false, hata: "Kaydedilemedi: " + error.message };
  if (!data?.length) return { ok: false, hata: "Bu cihaz kayıtlı değil; bildirimleri kapatıp yeniden açın." };
  return { ok: true };
}
