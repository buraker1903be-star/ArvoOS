import { timingSafeEqual } from "node:crypto";
import { arcIadeleriBildir, syncArcTenants } from "@/lib/arc-bridge";
import { cronRotasi, type CronKosusu } from "@/lib/cron-kaydi";

// ArvoARC köprüsünün tam eşitlemesi (lib/arc-bridge.ts). Vercel zamanlayıcısı
// 10 dakikada bir çağırır (vercel.json). Anında aktarımın kaçırdığı her
// değişikliği yakalar: üyeliği veritabanı tetikleyicisiyle değişen personel,
// kurum bilgisi (unvan, vergi no — vitrinin yasal sayfaları bunu okuyor),
// başarısız olmuş anında çağrılar.
//
// Vercel isteğe "Authorization: Bearer <CRON_SECRET>" ekler. CRON_SECRET
// tanımlı değilse uç kapalıdır (kapalı başarısızlık).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(header.slice("Bearer ".length));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// Koşma kaydı lib/cron-kaydi ile; yetkisiz istek KAYDEDİLMEZ (dışarıdan
// tablo şişirilmesin), kayıt da zamanlayıcının kendi çağrısını ölçsün.
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Yetkisiz", { status: 401 });
  return cronRotasi("/api/cron/arc-sync", kosu);
}

async function kosu(): Promise<CronKosusu> {
  const result = await syncArcTenants();

  /*
    Aynı turda ArvoARC'taki yeni iade taleplerini panele bildiriyoruz.
    Eşitlemenin BAŞARISINA BAĞLI DEĞİL: lisans aktarımı düşse bile
    iade talebi kurum sahibine ulaşmalı. Kendi hatası da eşitlemeyi
    başarısız göstermiyor — ikisi ayrı iş, tek rotada koşuyorlar.
  */
  const iadeler = await arcIadeleriBildir();
  if (iadeler === null) console.error("[arc] iade bildirimleri taranamadı");
  // Kısmi hata da başarısızlıktır: 200 dönmek Vercel'in zamanlayıcı
  // geçmişinde "sorun yok" gösteriyor, eksik kalan aktarım hiç fark edilmiyordu.
  const failed = result.status === "failed" || result.status === "partial";
  if (failed) console.error("[arc] zamanlanmış eşitleme eksik", result.status, result.errors);
  /* "not_configured" İŞİN KENDİSİ İÇİN BAŞARI: iş koştu ve yapacak bir şey
     olmadığını doğru gördü. Köprünün yapılandırmasını Sistem Sağlığı'nın
     "Ürün köprüleri" kartı söylüyor; aynı şeyi iki kart birden bağırırsa
     ikisi de okunmaz olur. */
  return {
    yanit: Response.json(result, { status: failed ? 500 : 200, headers: { "Cache-Control": "no-store" } }),
    sonuc: result.status === "failed" ? "hata" : result.status === "partial" ? "eksik" : "tamam",
    ayrinti: { durum: result.status, kurum: result.organizations, uyelik: result.memberships, iade: iadeler, hata: result.errors.slice(0, 5) },
  };
}
