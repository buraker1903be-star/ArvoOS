import { createHash, timingSafeEqual } from "node:crypto";
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
  /* Baş ve sondaki boşluk yok sayılır: şifre Vault'a ve Vercel'e elle
     yapıştırılıyor; araya giren bir satır sonu her haberi 401'e
     düşürüyordu ve "Deneme gönder" (bu yolu kullanmıyor) çalıştığı için
     fark edilmiyordu (13.10.2026). */
  const sir = process.env.PUSH_WEBHOOK_SECRET?.trim();
  const baslik = istek.headers.get("authorization") ?? "";
  if (!sir || !baslik.startsWith("Bearer ")) return false;
  const beklenen = Buffer.from(sir);
  const gelen = Buffer.from(baslik.slice("Bearer ".length).trim());
  return beklenen.length === gelen.length && timingSafeEqual(beklenen, gelen);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESKI = 10 * 60 * 1000;

export async function POST(istek: Request) {
  if (!yetkili(istek)) {
    /* Şifrenin KENDİSİ değil, uzunluğu ve özetinin başı: Vault ile Vercel
       uyuşmadığında hangisinin farklı olduğu kayıttan okunabilsin
       (13.10.2026'da iki taraf saatlerce tahminle karşılaştırıldı). */
    const ozet = (metin: string) => `${metin.length}:${createHash("sha256").update(metin).digest("hex").slice(0, 12)}`;
    const gelen = (istek.headers.get("authorization") ?? "").replace(/^Bearer /, "").trim();
    console.warn("[push] yetkisiz haber", { gelen: ozet(gelen), beklenen: ozet(process.env.PUSH_WEBHOOK_SECRET?.trim() ?? "") });
    return Response.json({ hata: "yetkisiz" }, { status: 401 });
  }
  if (!pushYapilandi()) return Response.json({ atlandi: "anahtar yok" });
  const admin = createAdminClient();
  if (!admin) return Response.json({ atlandi: "sunucu anahtarı yok" });

  const govde = (await istek.json().catch(() => null)) as { id?: unknown; mesaj_id?: unknown } | null;
  // Ekip mesajı (20261013100546): bildirim satırı yok, mesajın kendisinden.
  if (typeof govde?.mesaj_id === "string") {
    if (!UUID.test(govde.mesaj_id)) return Response.json({ hata: "kimlik" }, { status: 400 });
    return Response.json(await ekipMesajiGonder(admin, govde.mesaj_id));
  }
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
    Alıcılar (tercih KİŞİ başına, 20261013090223):
    - Kişiye özel bildirim: o kişi, bildirimleri kapatmadıysa.
    - Gelen posta (kuruma yayın): postayı açmış kişiler, postayı görme
      yetkisi şimdi yeniden hesaplanarak.
    - Diğer yayınlar (20261013100546): panelde herkese görünüyor; kurumun
      etkin üyelerinden bildirimleri kapatmamış olanlar. Eskiden
      telefona hiç gitmiyordu.
  */
  const yayin = !satir.user_id;
  const posta = yayin && satir.category === "posta_gelen";
  let alicilar: string[];
  if (!yayin) {
    alicilar = [satir.user_id as string];
  } else if (posta) {
    const { data, error: hata } = await admin.from("push_tercihleri").select("user_id")
      .eq("organization_id", satir.organization_id).eq("posta", true).eq("acik", true);
    if (hata) return hataDon("tercihler", hata.message);
    alicilar = (data ?? []).map((t) => t.user_id as string);
  } else {
    const { data, error: hata } = await admin.from("organization_memberships").select("user_id")
      .eq("organization_id", satir.organization_id).eq("is_active", true);
    if (hata) return hataDon("üyeler", hata.message);
    alicilar = (data ?? []).map((u) => u.user_id as string);
  }
  if (!posta) alicilar = await kapatanlariCikar(admin, satir.organization_id, alicilar);
  if (!alicilar.length) return Response.json({ atlandi: "alıcı yok" });

  const { data: cihazlar, error: cihazHatasi } = await admin.from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth,failure_count").eq("organization_id", satir.organization_id).in("user_id", alicilar);
  if (cihazHatasi) return hataDon("cihazlar", cihazHatasi.message);
  let hedefler = (cihazlar ?? []) as (PushCihazi & { user_id: string })[];
  if (posta) {
    const gorenler = await postaGorenler(admin, satir.organization_id, [...new Set(hedefler.map((c) => c.user_id))]);
    hedefler = hedefler.filter((c) => gorenler.has(c.user_id));
  }
  const sonuc = await cihazlaraGonder(admin, hedefler, bildirimYuku(satir));
  return Response.json(sonuc);
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

function hataDon(ne: string, mesaj: string) {
  console.error(`[push] ${ne} okunamadı`, mesaj);
  return Response.json({ hata: ne }, { status: 500 });
}

/** Bildirimleri bütün cihazlarında kapatmış kişileri çıkarır (satırı olmayan açık sayılır). */
async function kapatanlariCikar(admin: Admin, orgId: string, kullanicilar: string[]) {
  if (!kullanicilar.length) return kullanicilar;
  const { data, error } = await admin.from("push_tercihleri").select("user_id")
    .eq("organization_id", orgId).eq("acik", false).in("user_id", kullanicilar);
  // Okunamazsa göndermemek, kapatmış birine göndermekten iyi.
  if (error) { console.error("[push] tercihler okunamadı", error.message); return []; }
  const kapali = new Set((data ?? []).map((t) => t.user_id as string));
  return kullanicilar.filter((k) => !kapali.has(k));
}

/*
  EKİP MESAJI (Mesajlar uygulaması). Başlık gönderen (grupta "Ad · Grup"),
  metin mesajın kendisi. Konuşmanın gönderen dışındaki etkin üyeleri;
  dokununca o sohbet açılır.
*/
async function ekipMesajiGonder(admin: Admin, mesajId: string) {
  const { data: mesaj, error } = await admin.from("internal_messages")
    .select("id,organization_id,channel_id,sender_id,body,attachment_name,deleted_at,created_at").eq("id", mesajId).maybeSingle();
  if (error) { console.error("[push] mesaj okunamadı", error.message); return { hata: "mesaj" }; }
  if (!mesaj || mesaj.deleted_at) return { atlandi: "mesaj yok" };
  if (Date.now() - new Date(mesaj.created_at).getTime() > ESKI) return { atlandi: "eski" };

  const [kanal, uyeler, gonderen] = await Promise.all([
    admin.from("message_channels").select("channel_type,name").eq("id", mesaj.channel_id).maybeSingle(),
    admin.from("message_channel_members").select("user_id").eq("channel_id", mesaj.channel_id),
    admin.from("hr_employees").select("full_name").eq("organization_id", mesaj.organization_id).eq("user_id", mesaj.sender_id).maybeSingle(),
  ]);
  if (kanal.error || uyeler.error) { console.error("[push] konuşma okunamadı", kanal.error?.message ?? uyeler.error?.message); return { hata: "konuşma" }; }
  const adaylar = [...new Set((uyeler.data ?? []).map((u) => u.user_id as string))].filter((u) => u !== mesaj.sender_id);
  // Kurumdan ayrılmış üyeye gitmesin.
  const { data: etkin } = adaylar.length
    ? await admin.from("organization_memberships").select("user_id").eq("organization_id", mesaj.organization_id).eq("is_active", true).in("user_id", adaylar)
    : { data: [] };
  const alicilar = await kapatanlariCikar(admin, mesaj.organization_id, (etkin ?? []).map((u) => u.user_id as string));
  if (!alicilar.length) return { atlandi: "alıcı yok" };
  const { data: cihazlar, error: cihazHatasi } = await admin.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,failure_count").eq("organization_id", mesaj.organization_id).in("user_id", alicilar);
  if (cihazHatasi) { console.error("[push] cihazlar okunamadı", cihazHatasi.message); return { hata: "cihazlar" }; }

  const ad = (gonderen.data?.full_name as string | undefined)?.trim() || "Ekipten biri";
  const grup = kanal.data?.channel_type === "channel" && kanal.data?.name ? ` · ${kanal.data.name}` : "";
  const govde = (mesaj.body as string | null)?.trim() || (mesaj.attachment_name ? `📎 ${mesaj.attachment_name}` : "Yeni mesaj");
  return cihazlaraGonder(admin, (cihazlar ?? []) as PushCihazi[], {
    baslik: `${ad}${grup}`.slice(0, 80),
    metin: govde.length > 240 ? `${govde.slice(0, 239)}…` : govde,
    adres: `/panel/messages?sohbet=${mesaj.channel_id}`,
    etiket: `arvo-mesaj-${mesaj.id}`,
  });
}
