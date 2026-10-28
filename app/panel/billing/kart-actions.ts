"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContextErisimdenBagimsiz as getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertYetki } from "@/lib/yetkiler";
import { kartOnayiniKaydet, kartSaklamaAcik, kurumKartOdemesiAc, platformKimligi } from "@/lib/paytr-kart-akisi";
import { kayitliKartiSil } from "@/lib/paytr-direkt";
import { firstForwardedIp } from "@/app/_components/request-origin";

/*
  Kartla ödeme ve kayıtlı kart işlemleri (28.10.2026). Yetki her işlemde
  burada: lisans yönetme yetkisi (dekont gönderebilen kişi, ödeyecek
  kişi). Veritabanı yazımı servis rolüyle — tablolar istemciye kapalı.
*/

const URUNLER = ["arvoos", "arvolab", "randevu"] as const;

async function istekIp() {
  const h = await headers();
  return (firstForwardedIp(h.get("x-forwarded-for")) || h.get("x-real-ip") || "").slice(0, 39);
}

async function yetkili() {
  if (!kartSaklamaAcik()) throw new Error("Kart kaydederek ödeme henüz açık değil.");
  const { organization, userId, yetkiler } = await getPanelContext();
  assertYetki(yetkiler, "finance.lisans.yonet");
  const admin = createAdminClient();
  if (!admin) throw new Error("Kartla ödeme şu an kullanılamıyor. Havale ile ödeyebilirsiniz.");
  return { organization, userId, admin };
}

async function kartlaOdemeyeBasla__impl(formData: FormData) {
  const urun = String(formData.get("product") ?? "");
  if (!URUNLER.includes(urun as (typeof URUNLER)[number])) throw new Error("Geçerli bir ürün seçilmedi.");
  const { organization, userId, admin } = await yetkili();
  const ip = await istekIp();
  if (!ip) throw new Error("Bağlantı bilgisi okunamadı; sayfayı yenileyip tekrar deneyin.");
  const oid = await kurumKartOdemesiAc(admin, { organizationId: organization.id, product: urun as (typeof URUNLER)[number], actorId: userId, ip });
  redirect(`/panel/billing/kart/${oid}`);
}

export async function kartlaOdemeyeBasla(formData: FormData) {
  return runPanelAction(() => kartlaOdemeyeBasla__impl(formData));
}

/**
 * Form PayTR'ye gönderilmeden hemen önce kart formu çağırır. Değer
 * döndürür (pencere içi çağrı): hata metni kullanıcıya formda gösterilir.
 */
export async function kartOnayi(merchantOid: string, otomatikYenileme: boolean): Promise<{ ok: true } | { hata: string }> {
  try {
    const { organization, userId, admin } = await yetkili();
    const ip = await istekIp();
    if (!ip) return { hata: "Bağlantı bilgisi okunamadı; sayfayı yenileyip tekrar deneyin." };
    await kartOnayiniKaydet(admin, { merchantOid: String(merchantOid), odeyen: { organizationId: organization.id }, actorId: userId, ip, otomatikYenileme: Boolean(otomatikYenileme) });
    return { ok: true };
  } catch (hata) {
    return { hata: hata instanceof Error ? hata.message : "Onay kaydedilemedi." };
  }
}

async function otomatikYenilemeyiKapat__impl(formData: FormData) {
  const urun = String(formData.get("product") ?? "");
  const { organization, userId, admin } = await yetkili();
  const { data, error } = await admin.from("paytr_otomatik_yenileme")
    .update({ aktif: false, kapatildi_at: new Date().toISOString(), kapatan: userId, updated_at: new Date().toISOString() })
    .eq("organization_id", organization.id).eq("product", urun).eq("aktif", true).select("id");
  if (error) throw new Error("Otomatik yenileme kapatılamadı: " + error.message);
  if (!data?.length) throw new Error("Bu ürün için açık bir otomatik yenileme yok.");
  revalidatePath("/panel/billing");
}

export async function otomatikYenilemeyiKapat(formData: FormData) {
  return runPanelAction(() => otomatikYenilemeyiKapat__impl(formData), "Otomatik yenileme kapatıldı. Sonraki dönemler için ödeme bağlantısı gönderilecek.");
}

/*
  Kart önce PayTR'den silinir, sonra bizden: tersi olsaydı PayTR'de
  kalan bir kart bizde görünmez ve müşteri "sildim" sanırdı. Kartın
  bağlı olduğu otomatik yenilemeler kaskatla gider.
*/
async function kayitliKartiKaldir__impl(formData: FormData) {
  const kartId = String(formData.get("kart_id") ?? "");
  const { organization, admin } = await yetkili();
  const { data: kart, error } = await admin.from("paytr_kayitli_kartlar").select("id,utoken,ctoken")
    .eq("id", kartId).eq("organization_id", organization.id).maybeSingle();
  if (error) throw new Error("Kart okunamadı: " + error.message);
  if (!kart) throw new Error("Kart bulunamadı.");
  const kimlik = await platformKimligi(admin);
  await kayitliKartiSil(kimlik, kart.utoken, kart.ctoken);
  const { error: silmeHatasi } = await admin.from("paytr_kayitli_kartlar").delete().eq("id", kart.id);
  if (silmeHatasi) throw new Error("Kart PayTR'den silindi ama kayıttan kaldırılamadı: " + silmeHatasi.message);
  revalidatePath("/panel/billing");
}

export async function kayitliKartiKaldir(formData: FormData) {
  return runPanelAction(() => kayitliKartiKaldir__impl(formData), "Kayıtlı kart silindi.");
}
