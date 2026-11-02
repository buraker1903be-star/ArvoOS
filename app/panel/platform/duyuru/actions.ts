"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { runPanelAction } from "@/lib/panel-action";
import { createAdminClient } from "@/lib/supabase/admin";
import { tumSatirlar } from "@/lib/rapor-okuma";
import { panelBildirimiYaz } from "@/lib/panel-bildirimi";
import { DUYURU_HEDEFLERI, duyuruAlicilari, duyuruDogrula, type DuyuruKiracisi, type DuyuruLisansi } from "@/lib/platform-duyuru";

/*
  KONSOLDAN KURUMLARA DUYURU (02.11.2026). Kural lib/platform-duyuru.ts,
  geçmiş tablosu migration 20261102083212.

  Sıra: önce geçmiş kaydı (kurucunun oturumuyla — RLS yalnızca kurucuya
  açık, yetkinin ikinci katmanı), sonra her kuruma bildirim (sunucu
  anahtarıyla, panelBildirimiYaz — köprülerle aynı yazma yolu), en son
  alıcı sayısı. Yineleme anahtarı duyurunun kimliği: aynı duyuru aynı
  kuruma iki kez düşmez (form iki kez gönderilse bile).

  Bir kuruma yazılamazsa duyuru durmuyor: kalanlar gönderiliyor ve kaç
  kurumda düştüğü sonuç mesajında yazıyor.
*/
async function duyuruGonder__impl(f: FormData) {
  const { supabase, userId, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Duyuruyu yalnızca kurucu gönderebilir.");
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil; duyuru gönderilemez.");

  const girdi = duyuruDogrula({
    baslik: String(f.get("baslik") ?? ""),
    metin: String(f.get("metin") ?? ""),
    baglanti: String(f.get("baglanti") ?? ""),
    hedef: String(f.get("hedef") ?? ""),
  });

  const [kiracilar, lisanslar] = await Promise.all([
    tumSatirlar<DuyuruKiracisi>("kiracılar", (bas, son) =>
      admin.from("platform_kiraci_liste").select("id,kind,license_status").order("id").range(bas, son)),
    tumSatirlar<DuyuruLisansi>("ürün lisansları", (bas, son) =>
      admin.from("organization_product_licenses").select("organization_id,product,status").order("organization_id").order("product").range(bas, son)),
  ]);
  const alicilar = duyuruAlicilari(kiracilar, lisanslar, girdi.hedef);
  if (!alicilar.length) throw new Error("Bu hedefte duyurunun gideceği kurum yok.");

  const { data: kayit, error } = await supabase.from("platform_duyurulari")
    .insert({ baslik: girdi.baslik, metin: girdi.metin, baglanti: girdi.baglanti, hedef: girdi.hedef, gonderen: userId })
    .select("id").single();
  if (error) throw new Error("Duyuru kaydedilemedi: " + error.message);

  let yazilan = 0;
  let dusen = 0;
  for (const organizationId of alicilar) {
    const sonuc = await panelBildirimiYaz(admin, {
      organizationId,
      category: "platform_duyurusu",
      title: girdi.baslik,
      message: girdi.metin,
      actionUrl: girdi.baglanti,
      dedupeKey: `duyuru:${kayit.id}`,
      metadata: { duyuru_id: kayit.id, sender_name: "ArvoOS" },
      kaynak: "konsol",
    });
    if (sonuc.yazildi) yazilan += 1;
    else if (sonuc.sebep === "hata") { dusen += 1; console.error("[duyuru] bildirim yazılamadı", organizationId, sonuc.hata); }
  }
  const { error: sayiHatasi } = await admin.from("platform_duyurulari").update({ alici_sayisi: yazilan }).eq("id", kayit.id);
  if (sayiHatasi) console.error("[duyuru] alıcı sayısı yazılamadı", sayiHatasi.message);
  revalidatePath("/panel/platform/duyuru");
  const hedefAdi = DUYURU_HEDEFLERI.find((h) => h.kod === girdi.hedef)?.ad ?? girdi.hedef;
  if (dusen) throw new Error(`Duyuru ${yazilan} kuruma gitti, ${dusen} kurumda yazılamadı (${hedefAdi}). Günlüğe bakın.`);
}

export async function duyuruGonder(f: FormData) {
  await runPanelAction(() => duyuruGonder__impl(f), "Duyuru gönderildi; alıcı sayısı geçmişte yazıyor");
}
