import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { productName } from "@/lib/products";
import { abonelikAnahtari, abonelikBildirimi, abonelikKademesi } from "@/lib/abonelik-bildirimi";
import { yetkisiOlanlar } from "@/lib/kisi-yetkileri";
import { ekKullaniciUcretiKurus } from "@/lib/kota-durumu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  ABONELİK ÖDEME HATIRLATMASI (13.10.2026). Her sabah 09:00 (Türkiye;
  vercel.json 06:00 UTC). Dönem sonu (ya da deneme sonu) 7, 3, 1, 0 gün
  kalan ve bir gün önce dolan kiracılara panel bildirimi; anlık bildirim
  tetikleyicisi telefona da götürür.

  Alıcı: kurumun "Lisans ve ödeme" yetkisi olan etkin üyeleri
  (finance.lisans.yonet — varsayılanı Kurum Sahibi ve yönetici).
  Çalışanlara gitmez. Karar rol listesiyle değil yetenekle (AGENTS.md).

  Kapsam: ödemesi ArvoOS panelinden yapılan lisanslar. ArvoRandevu salonu
  ödemesini kendi uygulamasında yapıyor, ArvoOS paneli ona bir şey
  söyleyemez; Arvo'nun kendi kurumları (kind = internal) ödeme yapmaz.

  ARVOOS ÇEKİRDEK LİSANSI DA (14.10.2026). Eskiden yalnızca ek ürünlerin
  lisansları (organization_product_licenses) okunuyordu; ArvoOS'un kendi
  lisansı organization_licenses'ta ve oraya hiç bakılmıyordu — panelin
  asıl aboneliği hatırlatmasız bitiyordu. Ücret, ödeme bağlantısının
  hesapladığıyla aynı: paket + dahil sayıyı aşan kullanıcılar
  (lib/license-checkout).

  Tekrar koşarsa aynı dönem ve kademe için ikinci bildirim yazılmaz
  (metadata.anahtar).

  Bu okuma bilerek SINIRSIZ: kurum başına birkaç lisans var ve hatırlatma
  eksik kalırsa kiracı habersiz kalır.
*/

function yetkili(istek: Request) {
  const sir = process.env.CRON_SECRET;
  const baslik = istek.headers.get("authorization") ?? "";
  if (!sir || !baslik.startsWith("Bearer ")) return false;
  const beklenen = Buffer.from(sir);
  const gelen = Buffer.from(baslik.slice("Bearer ".length));
  return beklenen.length === gelen.length && timingSafeEqual(beklenen, gelen);
}

type Lisans = {
  organization_id: string; product: string; status: string; monthly_fee: number | null;
  current_period_end: string | null; trial_ends_at: string | null;
};

export async function GET(istek: Request) {
  if (!yetkili(istek)) return Response.json({ hata: "yetkisiz" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ hata: "sunucu anahtarı yok" }, { status: 500 });

  const bugun = todayInIstanbul();
  const [{ data: lisanslar, error }, { data: cekirdekler, error: cekirdekHatasi }] = await Promise.all([
    admin.from("organization_product_licenses")
      .select("organization_id,product,status,monthly_fee,current_period_end,trial_ends_at")
      .in("status", ["trialing", "active", "past_due"]).neq("product", "randevu"),
    admin.from("organization_licenses")
      .select("organization_id,license_status,monthly_fee,user_limit,extra_user_fee,current_period_end,trial_ends_at")
      .in("license_status", ["trialing", "active", "past_due"]),
  ]);
  if (error || cekirdekHatasi) {
    console.error("[abonelik] lisanslar okunamadı", (error ?? cekirdekHatasi)?.message);
    return Response.json({ hata: "lisanslar" }, { status: 500 });
  }
  type Cekirdek = {
    organization_id: string; license_status: string; monthly_fee: number | null; user_limit: number | null;
    extra_user_fee: number | null; current_period_end: string | null; trial_ends_at: string | null;
  };
  const cekirdekSatirlari = (cekirdekler ?? []) as Cekirdek[];
  const tumLisanslar: (Lisans & { cekirdek?: Cekirdek })[] = [
    ...((lisanslar ?? []) as Lisans[]),
    ...cekirdekSatirlari.map((c) => ({
      organization_id: c.organization_id, product: "arvoos", status: c.license_status, monthly_fee: c.monthly_fee,
      current_period_end: c.current_period_end, trial_ends_at: c.trial_ends_at, cekirdek: c,
    })),
  ];

  // Yalnızca bugün bir kademeye düşenler.
  const adaylar = tumLisanslar.flatMap((l) => {
    const deneme = l.status === "trialing";
    const bitis = deneme ? l.trial_ends_at : l.current_period_end;
    if (!bitis) return [];
    const kademe = abonelikKademesi(bitis, bugun);
    return kademe === null ? [] : [{ ...l, deneme, bitis, kademe }];
  });
  if (!adaylar.length) return Response.json({ bugun, yazilan: 0 });

  const { data: kurumlar, error: kurumHatasi } = await admin.from("organizations")
    .select("id,kind").in("id", [...new Set(adaylar.map((a) => a.organization_id))]);
  if (kurumHatasi) {
    console.error("[abonelik] kurumlar okunamadı", kurumHatasi.message);
    return Response.json({ hata: "kurumlar" }, { status: 500 });
  }
  const ic = new Set((kurumlar ?? []).filter((k) => k.kind === "internal").map((k) => k.id as string));

  let yazilan = 0;
  const hatalar: string[] = [];
  for (const a of adaylar) {
    if (ic.has(a.organization_id)) continue;
    const anahtar = abonelikAnahtari(a.organization_id, a.product, a.bitis, a.kademe);
    const { data: onceki, error: oncekiHatasi } = await admin.from("notifications").select("id")
      .eq("organization_id", a.organization_id).eq("category", "subscription_reminder").eq("metadata->>anahtar", anahtar).limit(1);
    // Önceki okunamazsa bu kurum bu tur atlanır (çift bildirim yerine); hata günlüğe ve yanıta yazılır.
    if (oncekiHatasi) { hatalar.push(oncekiHatasi.message); continue; }
    if (onceki?.length) continue;

    const alicilar = [...await yetkisiOlanlar(admin, a.organization_id, "finance.lisans.yonet")];
    if (!alicilar.length) continue;
    let aylikUcret = a.monthly_fee ? Number(a.monthly_fee) : null;
    if (a.cekirdek && aylikUcret) {
      // Ödeme bağlantısıyla aynı tutar: paket + dahil sayıyı aşan etkin kullanıcılar.
      const { count, error: sayimHatasi } = await admin.from("organization_memberships")
        .select("user_id", { count: "exact", head: true }).eq("organization_id", a.organization_id).eq("is_active", true);
      // Sayılamazsa tutar yazılmıyor: eksik tutar, hiç yazmamaktan kötü.
      aylikUcret = sayimHatasi ? null
        : aylikUcret + ekKullaniciUcretiKurus(count ?? 0, a.cekirdek.user_limit, a.cekirdek.extra_user_fee ?? 0);
    }
    const metin = abonelikBildirimi({ urunAdi: productName(a.product), deneme: a.deneme, bitis: a.bitis, kademe: a.kademe, aylikUcret });
    const { error: yazmaHatasi } = await admin.from("notifications").insert(alicilar.map((kullanici) => ({
      organization_id: a.organization_id,
      user_id: kullanici,
      audience: "organization",
      category: "subscription_reminder",
      title: metin.baslik,
      message: metin.metin,
      action_url: "/panel/billing",
      metadata: { anahtar, product: a.product, bitis: a.bitis, kademe: a.kademe, deneme: a.deneme, ton: metin.ton },
    })));
    if (yazmaHatasi) hatalar.push(yazmaHatasi.message);
    else yazilan += alicilar.length;
  }
  if (hatalar.length) console.error("[abonelik] hatırlatma yazılamadı", hatalar);
  return Response.json({ bugun, aday: adaylar.length, yazilan, hata: hatalar.length }, { status: hatalar.length ? 500 : 200 });
}
