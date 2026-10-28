import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { productName } from "@/lib/products";
import { abonelikAnahtari, abonelikBildirimi, abonelikKademesi } from "@/lib/abonelik-bildirimi";
import { yetkisiOlanlar } from "@/lib/kisi-yetkileri";
import { donemTutari } from "@/lib/abonelik-tutari";
import { musteriMi } from "@/lib/kurum-turu";
import { getArvolabBridgeHealth, syncArvolabLicense } from "@/lib/arvolab";
import { kurucuyaBildir } from "@/lib/kurucu-bildirimi";
import { cronRotasi, type CronKosusu } from "@/lib/cron-kaydi";
import { kartSaklamaAcik } from "@/lib/paytr-kart-akisi";

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

// Koşma kaydı lib/cron-kaydi ile; yetkisiz istek kaydedilmez. Gövde
// Response değil CronKosusu döndürüyor: dört erken dönüşten birinde kaydı
// atlamak işi "durmuş" gösterirdi, tip buna izin vermiyor.
export async function GET(istek: Request) {
  if (!yetkili(istek)) return Response.json({ hata: "yetkisiz" }, { status: 401 });
  return cronRotasi("/api/cron/abonelik-hatirlatma", kosu);
}

/*
  ARVOLAB KÖPRÜSÜ GÜNDE BİR DENETLENİYOR.

  Üç ürünün de eşitleme cron'u var ve köprüleri koptuğunda o iş hata
  veriyor; koşma nöbeti (lib/cron-kaydi) kurucuya bildiriyor. Ama
  eşitleme yalnızca SAPMIŞ kopyayı düzeltiyor: ArvoLab'ın köprüsü
  yapılandırma hatasıyla kapalıysa (anahtar eksik ya da iki tarafta
  farklı) sapma hiç görülemiyor, çünkü kopyalar okunamıyor. O durumu
  yalnızca Sistem Sağlığı ekranı açıldığında fark ediliyordu ve ekranın
  kendi yorumu "kurucu aylar sonra fark ediyordu" diyor.

  Koşul sağlık ekranının "Yanıt vermiyor" dediğinin aynısı: son hata son
  başarıdan yeni (lib/arvolab getArvolabBridgeHealth). BAYATLIK
  denetlenmiyor — last_ok_at'i ArvoLab yazıyor ve nabızla mı kullanıcı
  etkinliğiyle mi yazdığı bu depodan görünmüyor; sessiz bir günü "köprü
  öldü" diye bildirmek yanlış alarm olurdu.

  Fırlatmıyor: köprü okunamadıysa hatırlatma işi devam ediyor.
*/
async function arvolabKoprusunuDenetle(admin: ReturnType<typeof createAdminClient>, gun: string) {
  if (!admin) return;
  try {
    const saglik = await getArvolabBridgeHealth();
    if (!saglik?.broken) return;
    await kurucuyaBildir(admin, {
      kategori: "kopru_koptu",
      anahtar: `kopru:arvolab:${gun}`,
      baslik: "ArvoLab köprüsü yanıt vermiyor",
      metin: saglik.permanent
        ? "Anahtar eksik ya da iki tarafta farklı: ArvoLab'ın kurum, lisans ve personel kopyası güncellenmiyor."
        : "ArvoLab ArvoOS'a ulaşamıyor: kurum, lisans ve personel kopyası güncellenmiyor.",
      adres: "/panel/platform/saglik",
      ek: { urun: "arvolab", kalici: saglik.permanent, son_hata: saglik.lastError },
    });
  } catch (hata) {
    console.error("[abonelik] ArvoLab köprüsü denetlenemedi", hata instanceof Error ? hata.message : hata);
  }
}

async function kosu(): Promise<CronKosusu> {
  const admin = createAdminClient();
  if (!admin) return {
    yanit: Response.json({ hata: "sunucu anahtarı yok" }, { status: 500 }),
    sonuc: "hata", ayrinti: { hata: "sunucu anahtarı yok" },
  };

  /*
    ÖNCE süresi dolan aktif lisanslar "ödemesi gecikmiş" olur
    (20261014071519; kapsam ve gerekçe migration'da: erişim değişmez,
    denemelere dokunulmaz). Hatırlatma aynı turda yeni durumu okusun.
    İşlev yoksa (migration uygulanmadıysa) hatırlatma yine çalışır.
    Değişen ArvoLab lisansı hemen itiliyor; üç ürün de on dakikalık
    eşitlemede ayrıca yakalanıyor (ArvoLab'ınki 14.10.2026'da eklendi).
  */
  const { data: isaretlenen, error: isaretHatasi } = await admin.rpc("platform_gecikenleri_isaretle");
  if (isaretHatasi) console.error("[abonelik] gecikenler işaretlenemedi", isaretHatasi.message);
  const isaret = (isaretlenen ?? { cekirdek: [], urun: [] }) as { cekirdek: string[]; urun: { organization_id: string; product: string }[] };
  for (const satir of isaret.urun.filter((u) => u.product === "arvolab")) await syncArvolabLicense(satir.organization_id);

  const bugun = todayInIstanbul();
  await arvolabKoprusunuDenetle(admin, bugun);

  const [{ data: lisanslar, error }, { data: cekirdekler, error: cekirdekHatasi }] = await Promise.all([
    admin.from("organization_product_licenses")
      .select("organization_id,product,status,monthly_fee,current_period_end,trial_ends_at")
      .in("status", ["trialing", "active", "past_due"]).neq("product", "randevu"),
    admin.from("organization_licenses")
      .select("organization_id,license_status,monthly_fee,user_limit,extra_user_fee,current_period_end,trial_ends_at")
      .in("license_status", ["trialing", "active", "past_due"]),
  ]);
  if (error || cekirdekHatasi) {
    const mesaj = (error ?? cekirdekHatasi)?.message ?? "lisanslar okunamadı";
    console.error("[abonelik] lisanslar okunamadı", mesaj);
    return { yanit: Response.json({ hata: "lisanslar" }, { status: 500 }), sonuc: "hata", ayrinti: { hata: mesaj } };
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
  /* Bugün bir kademeye düşen lisans yok: iş koştu, hatırlatacak bir şey
     bulamadı — başarı. Gecikenlerin işaretlenmesi yine yapıldı. */
  if (!adaylar.length) return {
    yanit: Response.json({ bugun, gecikmis: isaret.cekirdek.length + isaret.urun.length, yazilan: 0 }),
    sonuc: isaretHatasi ? "eksik" : "tamam",
    ayrinti: { gecikmis: isaret.cekirdek.length + isaret.urun.length, aday: 0, yazilan: 0, ...(isaretHatasi ? { hata: isaretHatasi.message } : {}) },
  };

  const { data: kurumlar, error: kurumHatasi } = await admin.from("organizations")
    .select("id,kind,grup_markasi").in("id", [...new Set(adaylar.map((a) => a.organization_id))]);
  if (kurumHatasi) {
    console.error("[abonelik] kurumlar okunamadı", kurumHatasi.message);
    return { yanit: Response.json({ hata: "kurumlar" }, { status: 500 }), sonuc: "hata", ayrinti: { hata: kurumHatasi.message } };
  }
  /* Arvo'nun kendisi ve grup markaları (lib/kurum-turu) ödeme yapmaz:
     hatırlatma yalnızca gerçek müşteriye. */
  const ic = new Set((kurumlar ?? []).filter((k) => !musteriMi(k)).map((k) => k.id as string));

  /*
    Otomatik yenilemesi açık lisansa bu hatırlatma GİTMEZ (28.10.2026):
    "ödemenizi kartla yapabilirsiniz" demek, kartından zaten çekim
    yapılacak kuruma çelişkili bir talimat. Onun hatırlatmasını ve
    başarısızlık bildirimini otomatik yenileme işi gönderiyor.
    Okunamazsa hatırlatma herkese gider: fazla hatırlatma, eksikten iyi.
  */
  const otomatik = new Set<string>();
  if (kartSaklamaAcik()) {
    const { data: acik, error: acikHatasi } = await admin.from("paytr_otomatik_yenileme").select("organization_id,product").eq("aktif", true).not("organization_id", "is", null);
    // hata-tamam: okunamazsa hatırlatma herkese gider (yukarıdaki gerekçe); günlüğe yazılıyor.
    if (acikHatasi) console.error("[abonelik] otomatik yenilemeler okunamadı", acikHatasi.message);
    for (const r of (acik ?? []) as { organization_id: string; product: string }[]) otomatik.add(`${r.organization_id}:${r.product}`);
  }

  let yazilan = 0;
  const hatalar: string[] = [];
  for (const a of adaylar) {
    if (ic.has(a.organization_id)) continue;
    if (otomatik.has(`${a.organization_id}:${a.product}`)) continue;
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
        : donemTutari({ urun: "arvoos", aylikUcret, aktifKullanici: count ?? 0, kullaniciLimiti: a.cekirdek.user_limit, ekKullaniciUcreti: a.cekirdek.extra_user_fee ?? 0 }).tutar;
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
  /* Gecikenler işaretlenemediyse "eksik": hatırlatma yazıldı ama konsolun
     "Ödemesi gecikmiş" sayısı bu tur güncellenmedi. */
  const kismi = hatalar.length > 0 || Boolean(isaretHatasi);
  return {
    yanit: Response.json({ bugun, gecikmis: isaret.cekirdek.length + isaret.urun.length, aday: adaylar.length, yazilan, hata: hatalar.length }, { status: hatalar.length ? 500 : 200 }),
    sonuc: kismi ? "eksik" : "tamam",
    ayrinti: {
      gecikmis: isaret.cekirdek.length + isaret.urun.length,
      aday: adaylar.length, yazilan,
      hata: [...(isaretHatasi ? ["gecikenler: " + isaretHatasi.message] : []), ...hatalar].slice(0, 5),
    },
  };
}
