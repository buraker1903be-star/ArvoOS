"use server";

import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushAdresiUygunMu } from "@/lib/anlik-bildirim";
import { organizationBrandName } from "@/lib/customer-message-templates";
import { cihazlaraGonder, pushYapilandi, type PushCihazi } from "@/lib/anlik-bildirim-gonder";

/*
  ANLIK BİLDİRİM AYARLARI (20261013071812, kişi tercihi 20261013090223).

  İki ayrı şey var:
  - CİHAZ kaydı (push_subscriptions): nereye gönderilecek. Yeni bir
    cihaz yalnızca o cihazın kendisinden eklenebilir — izni tarayıcı
    orada soruyor (Apple ve Google kuralı).
  - KİŞİ tercihi (push_tercihleri): bildirim açık mı, gelen posta da mı.
    Kurum sahibinin kuralı: "masaüstünden yapılan her ayar tüm etkin
    cihazlarda da geçerli olmalı" — tercih hangi cihazdan değişirse
    değişsin kişinin bütün cihazlarına uygulanıyor; cihaz listesinden
    başka bir cihaz da kaldırılabiliyor.

  Tablolar istemciye kapalı; burada service_role ile, OTURUMDAKİ kişinin
  satırları üzerinde çalışılıyor (herkes yalnızca kendi ayarını değiştirir).

  Dönüş düz nesne, runPanelAction değil: kart sonucu kendi yerinde
  yazıyor; çerezli bildirim burada ikinci bir ses olurdu.
*/
type Sonuc = { ok: true } | { ok: false; hata: string };

const KAPALI = "Anlık bildirim bu kurulumda henüz açılmadı (sunucu anahtarları tanımlı değil).";

export type AnlikCihaz = { id: string; cihaz: string; eklendi: string; sonBasari: string | null; buCihaz: boolean };
export type AnlikOzet = { acik: boolean; posta: boolean; postaGorur: boolean; cihazlar: AnlikCihaz[]; buCihazKayitli: boolean };

async function baglam() {
  const { userId, membership, izin, organization } = await getPanelContext();
  return { userId, orgId: membership.organization_id, izin, organization, admin: createAdminClient() };
}

/** Kişinin tercihi ve kayıtlı cihazları. endpoint: bu tarayıcının aboneliği (varsa). */
export async function anlikBildirimOzeti(endpoint: string | null): Promise<AnlikOzet | null> {
  const { userId, orgId, izin, admin } = await baglam();
  if (!admin || !pushYapilandi()) return null;
  const [tercih, cihazlar] = await Promise.all([
    admin.from("push_tercihleri").select("acik,posta").eq("organization_id", orgId).eq("user_id", userId).maybeSingle(),
    admin.from("push_subscriptions").select("id,endpoint,cihaz,created_at,last_success_at")
      .eq("organization_id", orgId).eq("user_id", userId).order("created_at", { ascending: false }),
  ]);
  if (tercih.error || cihazlar.error) return null;
  const postaGorur = izin("posta.gor");
  const liste = (cihazlar.data ?? []).map((c) => ({
    id: c.id as string,
    cihaz: (c.cihaz as string | null) || "Cihaz",
    eklendi: c.created_at as string,
    sonBasari: (c.last_success_at as string | null) ?? null,
    buCihaz: Boolean(endpoint) && c.endpoint === endpoint,
  }));
  return {
    // Satırı olmayan kişi: açık, posta kapalı (20261013090223).
    acik: tercih.data ? Boolean(tercih.data.acik) : true,
    posta: postaGorur && Boolean(tercih.data?.posta),
    postaGorur,
    cihazlar: liste,
    buCihazKayitli: liste.some((c) => c.buCihaz),
  };
}

/** Bu cihazı ekler. Kişinin elle yaptığı bir açma: bildirimleri kapattıysa yeniden açar. */
export async function anlikBildirimAc(abonelik: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }, cihaz: string): Promise<Sonuc> {
  if (!pushYapilandi()) return { ok: false, hata: KAPALI };
  const { userId, orgId, admin } = await baglam();
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
    organization_id: orgId,
    user_id: userId,
    endpoint, p256dh, auth,
    cihaz: cihaz.slice(0, 200) || null,
    failure_count: 0,
  }, { onConflict: "endpoint" });
  if (error) return { ok: false, hata: "Cihaz kaydedilemedi: " + error.message };

  const { error: tercihHatasi } = await admin.from("push_tercihleri")
    .upsert({ organization_id: orgId, user_id: userId, acik: true, updated_at: new Date().toISOString() }, { onConflict: "organization_id,user_id" });
  if (tercihHatasi) return { ok: false, hata: "Tercih kaydedilemedi: " + tercihHatasi.message };

  const { data: fazla } = await admin.from("push_subscriptions").select("id")
    .eq("user_id", userId).order("created_at", { ascending: false }).range(10, 100);
  if (fazla?.length) await admin.from("push_subscriptions").delete().in("id", fazla.map((s) => s.id));
  return { ok: true };
}

/** Kişinin tercihi: bütün cihazlarında geçerli. Gelen posta yalnızca postayı görebilene. */
export async function anlikBildirimTercih(degisiklik: { acik?: boolean; posta?: boolean }): Promise<Sonuc> {
  const { userId, orgId, izin, admin } = await baglam();
  if (!admin) return { ok: false, hata: KAPALI };
  if (degisiklik.posta === true && !izin("posta.gor")) return { ok: false, hata: "Ortak posta kutusunu görme yetkiniz yok." };
  const satir: Record<string, unknown> = { organization_id: orgId, user_id: userId, updated_at: new Date().toISOString() };
  if (typeof degisiklik.acik === "boolean") satir.acik = degisiklik.acik;
  if (typeof degisiklik.posta === "boolean") satir.posta = degisiklik.posta;
  const { error } = await admin.from("push_tercihleri").upsert(satir, { onConflict: "organization_id,user_id" });
  if (error) return { ok: false, hata: "Kaydedilemedi: " + error.message };
  return { ok: true };
}

/** Bir cihazı listeden kaldırır (başka bir cihazdan da). Yalnızca kendi cihazı. */
export async function anlikBildirimCihazKaldir(cihazId: string): Promise<Sonuc> {
  const { userId, orgId, admin } = await baglam();
  if (!admin) return { ok: false, hata: KAPALI };
  const { data, error } = await admin.from("push_subscriptions").delete()
    .eq("id", cihazId).eq("user_id", userId).eq("organization_id", orgId).select("id");
  if (error) return { ok: false, hata: "Kaldırılamadı: " + error.message };
  if (!data?.length) return { ok: false, hata: "Cihaz bulunamadı." };
  return { ok: true };
}

/*
  "Deneme gönder": kişinin bu kurumdaki BÜTÜN cihazlarına, bildirim kaydı
  açmadan. Eskiden yalnızca düğmeye basılan cihaza gidiyordu: kurum
  sahibi masaüstünden basıp telefonunu bekledi (13.10.2026). Bildirimler
  kapalıyken de gider: denemenin amacı cihazın ulaşılabilir olduğunu görmek.
*/
export async function anlikBildirimDene(): Promise<{ ok: true; gonderilen: number; toplam: number } | { ok: false; hata: string }> {
  if (!pushYapilandi()) return { ok: false, hata: KAPALI };
  const { userId, orgId, organization, admin } = await baglam();
  if (!admin) return { ok: false, hata: KAPALI };
  const { data, error } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth,failure_count")
    .eq("user_id", userId).eq("organization_id", orgId);
  if (error) return { ok: false, hata: "Cihazlar okunamadı: " + error.message };
  if (!data?.length) return { ok: false, hata: "Kayıtlı cihazınız yok; önce bir cihazda bildirimleri açın." };
  const { gonderilen } = await cihazlaraGonder(admin, data as PushCihazi[], {
    // Kurumun kendi adı: AkademikMerkez kullanıcısının kilit ekranında "ArvoOS" yazıyordu.
    baslik: `${organizationBrandName({ slug: organization.slug, displayName: organization.display_name, legalName: organization.name })} bildirimleri açık`,
    metin: "İş atandığında, müşteri yazdığında ve size yorum geldiğinde burada haber vereceğiz.",
    adres: "/panel/notifications",
    etiket: "arvo-deneme",
  });
  return gonderilen ? { ok: true, gonderilen, toplam: data.length } : { ok: false, hata: "Deneme gönderilemedi; cihaz kayıtları yenilenmeli. Cihazda bildirimleri yeniden açın." };
}
