"use server";

import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { flashSuccess, runPanelAction } from "@/lib/panel-action";
import { productName } from "@/lib/products";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { musteriMi } from "@/lib/kurum-turu";
import { bireyselAylikUcret } from "@/lib/bireysel-ucret";
import { satici } from "@/lib/faturalama-koprusu";
import { epostaGonder } from "@/lib/eposta-gonder";
import { alicilariTopla, turkiyeGunu } from "@/lib/otomatik-proforma";
import { hatirlatmaPostasi, type HatirlatmaKalemi } from "@/lib/abonelik-hatirlatma-postasi";
import { PLATFORM_HOST } from "@/lib/public-host";
import { PRODUCT_APPS } from "@/lib/site/routes";

/*
  MÜŞTERİ LİSTESİNİN TOPLU HATIRLATMASI (29.10.2026).

  Kurucu listeden birkaç müşteri seçip abonelik hatırlatma e-postasını tek
  seferde gönderiyor. Alıcı kuralı otomatik proformayla aynı (kurumda
  etkin Kurum Sahipleri, sahip e-postası yoksa kurumun iletişim adresi;
  bireyselde abone). Mektup açık her ürünü (deneme, aktif, gecikmiş) dönem
  sonuyla birlikte sayıyor; kapanmış ürün yazılmıyor.

  Seçim istemciden geliyor ama yalnızca KİMLİK: alıcıyı, ürünleri ve
  tarihleri sunucu kendisi okuyor. Kurucu denetimi işlemin başında; okuma
  servis rolüyle (üyelikler ve abone kayıtları istemciye kapalı).

  Arvo'nun kendi kurumu ve grup markaları ödeme yapmadığı için atlanıyor.
  Tek seferde en çok SINIR müşteri: bir yanlış tıklama bütün müşteri
  tabanına posta göndermesin.
*/
const SINIR = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACIK = ["active", "trialing", "past_due"];

async function topluHatirlatma__impl(formData: FormData) {
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Toplu hatırlatmayı yalnızca platform kurucusu gönderebilir.");
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu yapılandırması eksik; hatırlatma gönderilemedi.");

  const secim = [...new Set(formData.getAll("secim").map(String))];
  if (!secim.length) throw new Error("Önce listeden müşteri seçin.");
  if (secim.length > SINIR) throw new Error(`Tek seferde en çok ${SINIR} müşteriye gönderilebilir; ${secim.length} seçili.`);
  const kurumIdleri = secim.filter((s) => s.startsWith("kurum:")).map((s) => s.slice(6)).filter((id) => UUID.test(id));
  const aboneIdleri = secim.filter((s) => s.startsWith("abone:")).map((s) => s.slice(6)).filter((id) => UUID.test(id));

  const bos = { data: [], error: null };
  const [kurumlar, cekirdek, urunler, sahipler, aboneler, s] = await Promise.all([
    kurumIdleri.length ? admin.from("organizations").select("id,name,display_name,kind,grup_markasi,contact_email").in("id", kurumIdleri) : bos,
    kurumIdleri.length ? admin.from("organization_licenses").select("organization_id,license_status,monthly_fee,current_period_end,trial_ends_at").in("organization_id", kurumIdleri).in("license_status", ACIK) : bos,
    kurumIdleri.length ? admin.from("organization_product_licenses").select("organization_id,product,status,monthly_fee,current_period_end,trial_ends_at").in("organization_id", kurumIdleri).in("status", ACIK) : bos,
    kurumIdleri.length ? admin.from("organization_memberships").select("organization_id,user_id").in("organization_id", kurumIdleri).eq("role", "owner").eq("is_active", true) : bos,
    aboneIdleri.length ? admin.from("product_subscribers").select("id,product,email,full_name,status,current_period_end,trial_ends_at").in("id", aboneIdleri) : bos,
    satici(admin),
  ]);
  const hata = kurumlar.error ?? cekirdek.error ?? urunler.error ?? sahipler.error ?? aboneler.error;
  if (hata) throw new Error("Müşteri bilgileri okunamadı: " + hata.message);

  const bugun = todayInIstanbul();
  const bireysel = aboneIdleri.length ? (await bireyselAylikUcret(admin, "arvolab")).aylik : null;
  const kalem = (urun: string, durum: string, donem: string | null, deneme: string | null, tutar: number | null): HatirlatmaKalemi[] => {
    const damga = durum === "trialing" ? deneme : donem;
    return damga ? [{ urunAdi: productName(urun as Parameters<typeof productName>[0]), bitis: turkiyeGunu(damga), deneme: durum === "trialing", tutar: tutar ? Number(tutar) : null }] : [];
  };

  type Hedef = { ad: string; alicilar: string[]; kalemler: HatirlatmaKalemi[]; adres: string };
  const hedefler: Hedef[] = [];
  let atlanan = 0;

  type K = { id: string; name: string; display_name: string | null; kind: string | null; grup_markasi: boolean | null; contact_email: string | null };
  for (const k of (kurumlar.data ?? []) as K[]) {
    if (!musteriMi(k)) { atlanan += 1; continue; }
    const kalemler = [
      ...((cekirdek.data ?? []) as { organization_id: string; license_status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }[])
        .filter((l) => l.organization_id === k.id).flatMap((l) => kalem("arvoos", l.license_status, l.current_period_end, l.trial_ends_at, l.monthly_fee)),
      ...((urunler.data ?? []) as { organization_id: string; product: string; status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }[])
        .filter((l) => l.organization_id === k.id).flatMap((l) => kalem(l.product, l.status, l.current_period_end, l.trial_ends_at, l.monthly_fee)),
    ].sort((a, b) => a.bitis.localeCompare(b.bitis));
    if (!kalemler.length) { atlanan += 1; continue; }
    const sahipIdleri = ((sahipler.data ?? []) as { organization_id: string; user_id: string }[]).filter((x) => x.organization_id === k.id).map((x) => x.user_id);
    let alicilar = alicilariTopla(await Promise.all(sahipIdleri.map(async (id) => (await admin.auth.admin.getUserById(id)).data.user?.email ?? null)));
    if (!alicilar.length) alicilar = alicilariTopla([k.contact_email]);
    hedefler.push({ ad: k.display_name || k.name, alicilar, kalemler, adres: `https://${PLATFORM_HOST}/panel/billing` });
  }
  for (const a of (aboneler.data ?? []) as { id: string; product: string; email: string; full_name: string | null; status: string; current_period_end: string | null; trial_ends_at: string | null }[]) {
    if (!ACIK.includes(a.status)) { atlanan += 1; continue; }
    const kalemler = kalem(a.product, a.status, a.current_period_end, a.trial_ends_at, bireysel);
    if (!kalemler.length) { atlanan += 1; continue; }
    hedefler.push({ ad: a.full_name || a.email, alicilar: alicilariTopla([a.email]), kalemler, adres: `${PRODUCT_APPS.arvolab.url}/dashboard/abonelik` });
  }

  let gonderilen = 0;
  const hatalar: string[] = [];
  for (const h of hedefler) {
    const posta = hatirlatmaPostasi({ muhatap: h.ad, kalemler: h.kalemler, adres: h.adres, bugun, satici: s.unvan });
    const sonuc = await epostaGonder({ kime: h.alicilar, konu: posta.konu, metin: posta.metin, html: posta.html });
    if (sonuc.ok) gonderilen += 1;
    else hatalar.push(`${h.ad}: ${sonuc.hata}`);
  }

  const ozet = [
    gonderilen ? `${gonderilen} müşteriye hatırlatma gönderildi` : null,
    atlanan ? `${atlanan} müşteri atlandı (açık aboneliği yok ya da Arvo/grup kaydı)` : null,
  ].filter(Boolean).join(" · ");
  // Kısmen başarılıysa hata olarak gösteriliyor: kurucu gönderilemeyenleri görmeli, başarı yeşili onu örtmesin.
  if (hatalar.length) throw new Error([ozet, `${hatalar.length} müşteriye gönderilemedi: ${hatalar.slice(0, 3).join(" · ")}`].filter(Boolean).join(" · "));
  if (!gonderilen) throw new Error(ozet || "Gönderilecek müşteri bulunamadı.");
  await flashSuccess(ozet);
}

export async function topluHatirlatma(formData: FormData): Promise<void> {
  await runPanelAction(() => topluHatirlatma__impl(formData));
}
