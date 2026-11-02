"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { flashSuccess, runPanelAction } from "@/lib/panel-action";
import { createAdminClient } from "@/lib/supabase/admin";
import { tumSatirlar } from "@/lib/rapor-okuma";
import { panelBildirimiYaz } from "@/lib/panel-bildirimi";
import { duyuruAlicilari, duyuruDogrula, duyuruPostasi, hedefAdi as hedefAdiBul, SECILI_SINIR, type DuyuruKiracisi, type DuyuruLisansi } from "@/lib/platform-duyuru";
import { epostaAyarli, epostaTopluGonder } from "@/lib/eposta-gonder";
import { alicilariTopla } from "@/lib/otomatik-proforma";
import { satici } from "@/lib/faturalama-koprusu";
import { PLATFORM_HOST } from "@/lib/public-host";

/*
  E-POSTA ALICILARI: kurumun etkin Kurum Sahipleri, sahip adresi yoksa
  kurumun iletişim adresi (toplu hatırlatma ve otomatik proformayla aynı
  kural). Üyelikler 100'lük dilimlerle okunuyor: yüzlerce kurumun
  kimliği tek bir `in` süzgecinde adresi taşırırdı.
*/
async function kurumYetkilileri(admin: NonNullable<ReturnType<typeof createAdminClient>>, kurumlar: string[]): Promise<Map<string, string[]>> {
  const sahipler = new Map<string, string[]>();
  const iletisim = new Map<string, string | null>();
  for (let i = 0; i < kurumlar.length; i += 100) {
    const dilim = kurumlar.slice(i, i + 100);
    const [uyelik, kurum] = await Promise.all([
      admin.from("organization_memberships").select("organization_id,user_id").in("organization_id", dilim).eq("role", "owner").eq("is_active", true),
      admin.from("organizations").select("id,contact_email").in("id", dilim),
    ]);
    if (uyelik.error || kurum.error) throw new Error("Kurum yetkilileri okunamadı: " + (uyelik.error ?? kurum.error)!.message);
    for (const u of (uyelik.data ?? []) as { organization_id: string; user_id: string }[]) sahipler.set(u.organization_id, [...(sahipler.get(u.organization_id) ?? []), u.user_id]);
    for (const k of (kurum.data ?? []) as { id: string; contact_email: string | null }[]) iletisim.set(k.id, k.contact_email);
  }
  const eposta = new Map<string, string | null>();
  const sonuc = new Map<string, string[]>();
  for (const id of kurumlar) {
    const adresler = await Promise.all((sahipler.get(id) ?? []).map(async (uid) => {
      if (!eposta.has(uid)) eposta.set(uid, (await admin.auth.admin.getUserById(uid)).data.user?.email ?? null);
      return eposta.get(uid) ?? null;
    }));
    let alicilar = alicilariTopla(adresler);
    if (!alicilar.length) alicilar = alicilariTopla([iletisim.get(id) ?? null]);
    sonuc.set(id, alicilar);
  }
  return sonuc;
}

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
  /* Seçili hedefte kimlikler formdan; duyuruAlicilari yalnızca gerçek kiracılarla kesiştiriyor. */
  const secili = [...new Set(f.getAll("kurum").map(String))];
  if (girdi.hedef === "secili" && secili.length > SECILI_SINIR) throw new Error(`Seçili hedefte en çok ${SECILI_SINIR} kurum olabilir; bütün kurumlar için "Bütün kurumlar" hedefini seçin.`);
  const alicilar = duyuruAlicilari(kiracilar, lisanslar, girdi.hedef, secili);
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

  /* E-posta bildirimden SONRA ve bildirimi geri almadan: posta düşerse
     duyuru yine panelde, sonuç mesajı kaç kurumun postasının gittiğini
     söylüyor. Adresi olmayan kurum sayılıyor, sessizce atlanmıyor. */
  let postaOzeti: string | null = null;
  if (f.get("eposta") === "1") {
    if (!epostaAyarli()) postaOzeti = "e-posta gönderilmedi: gönderim ayarlı değil (RESEND_API_KEY)";
    else {
      const [yetkililer, s] = await Promise.all([kurumYetkilileri(admin, alicilar), satici(admin)]);
      const adres = `https://${PLATFORM_HOST}${girdi.baglanti ?? "/panel/notifications"}`;
      const posta = duyuruPostasi({ baslik: girdi.baslik, metin: girdi.metin, adres, dugme: girdi.baglanti ? "Ayrıntıyı aç" : "Panelde görüntüle", satici: s.unvan });
      const mektuplar = alicilar.map((id) => ({ kime: yetkililer.get(id) ?? [], ...posta }));
      const adressiz = mektuplar.filter((m) => !m.kime.length).length;
      const { gonderilen, hatalar } = await epostaTopluGonder(mektuplar);
      if (hatalar.length) console.error("[duyuru] e-posta", hatalar);
      postaOzeti = [`${gonderilen} kuruma e-posta gitti`, adressiz ? `${adressiz} kurumun adresi yok` : null, hatalar.length ? `gönderilemeyen dilim: ${hatalar[0]}` : null].filter(Boolean).join(", ");
    }
  }

  const hedefAdi = hedefAdiBul(girdi.hedef);
  if (dusen) throw new Error([`Duyuru ${yazilan} kuruma gitti, ${dusen} kurumda yazılamadı (${hedefAdi}). Günlüğe bakın.`, postaOzeti].filter(Boolean).join(" · "));
  await flashSuccess([`Duyuru ${yazilan} kurumun bildirimlerine düştü`, postaOzeti].filter(Boolean).join(" · "));
}

export async function duyuruGonder(f: FormData) {
  await runPanelAction(() => duyuruGonder__impl(f));
}
