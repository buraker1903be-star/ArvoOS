import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { bildirimYuku } from "@/lib/anlik-bildirim";
import { cihazlaraGonder, postaGorenler, pushYapilandi, type PushCihazi } from "@/lib/anlik-bildirim-gonder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  VERİTABANININ HABERİ (20261013071812): notifications'a kişiye özel
  bir satır yazılınca tetikleyici buraya { id } POST eder.

  Gövdeye GÜVENİLMEZ: yalnızca kimlik alınır, bildirim service_role ile
  yeniden okunur; başlık, metin ve alıcı oradan gelir. Böylece sır bir
  gün sızsa bile biri kendi yazdığı metni başkasının telefonuna
  gönderemez — en fazla var olan bir bildirimi yeniden çaldırır.
  Çok eski bir bildirim (10 dakika) yeniden gönderilmez.
*/
function yetkili(istek: Request) {
  const sir = process.env.PUSH_WEBHOOK_SECRET;
  const baslik = istek.headers.get("authorization") ?? "";
  if (!sir || !baslik.startsWith("Bearer ")) return false;
  const beklenen = Buffer.from(sir);
  const gelen = Buffer.from(baslik.slice("Bearer ".length));
  return beklenen.length === gelen.length && timingSafeEqual(beklenen, gelen);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESKI = 10 * 60 * 1000;

export async function POST(istek: Request) {
  if (!yetkili(istek)) return Response.json({ hata: "yetkisiz" }, { status: 401 });
  if (!pushYapilandi()) return Response.json({ atlandi: "anahtar yok" });
  const admin = createAdminClient();
  if (!admin) return Response.json({ atlandi: "sunucu anahtarı yok" });

  const govde = (await istek.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof govde?.id === "string" ? govde.id : "";
  if (!UUID.test(id)) return Response.json({ hata: "kimlik" }, { status: 400 });

  const { data: satir, error } = await admin.from("notifications")
    .select("id,organization_id,user_id,audience,category,title,message,action_url,created_at").eq("id", id).maybeSingle();
  if (error) {
    console.error("[push] bildirim okunamadı", error.message);
    return Response.json({ hata: "okunamadı" }, { status: 500 });
  }
  if (!satir || satir.audience !== "organization") return Response.json({ atlandi: "kurum bildirimi değil" });
  if (Date.now() - new Date(satir.created_at).getTime() > ESKI) return Response.json({ atlandi: "eski" });

  /*
    Kişiye özel bildirim: o kişinin cihazları, bildirimleri kapatmadıysa.
    Kuruma yayın yalnızca gelen posta için: postayı açmış kişilerin
    cihazları, postayı görme yetkisi şimdi yeniden hesaplanarak. Tercih
    KİŞİ başına (20261013090223): hangi cihazdan ayarlandıysa hepsinde.
  */
  const yayin = !satir.user_id;
  if (yayin && satir.category !== "posta_gelen") return Response.json({ atlandi: "yayın" });
  const tercihSorgusu = admin.from("push_tercihleri").select("user_id,acik,posta").eq("organization_id", satir.organization_id);
  const { data: tercihler, error: tercihHatasi } = await (yayin
    ? tercihSorgusu.eq("posta", true).eq("acik", true)
    : tercihSorgusu.eq("user_id", satir.user_id as string));
  if (tercihHatasi) {
    console.error("[push] tercihler okunamadı", tercihHatasi.message);
    return Response.json({ hata: "tercihler" }, { status: 500 });
  }
  // Satırı olmayan kişi açık sayılır (yalnızca kişiye özelde; postada satır şart).
  if (!yayin && tercihler?.length && !tercihler[0].acik) return Response.json({ atlandi: "kişi kapattı" });
  const alicilar = yayin ? (tercihler ?? []).map((t) => t.user_id as string) : [satir.user_id as string];
  if (!alicilar.length) return Response.json({ atlandi: "alıcı yok" });
  const { data: cihazlar, error: cihazHatasi } = await admin.from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth,failure_count").eq("organization_id", satir.organization_id).in("user_id", alicilar);
  if (cihazHatasi) {
    console.error("[push] cihazlar okunamadı", cihazHatasi.message);
    return Response.json({ hata: "cihazlar" }, { status: 500 });
  }
  let hedefler = (cihazlar ?? []) as (PushCihazi & { user_id: string })[];
  if (yayin) {
    const gorenler = await postaGorenler(admin, satir.organization_id, [...new Set(hedefler.map((c) => c.user_id))]);
    hedefler = hedefler.filter((c) => gorenler.has(c.user_id));
  }
  const sonuc = await cihazlaraGonder(admin, hedefler, bildirimYuku(satir));
  return Response.json(sonuc);
}
