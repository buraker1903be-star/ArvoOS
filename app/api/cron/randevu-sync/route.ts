import { timingSafeEqual } from "node:crypto";
import { syncRandevuTenants } from "@/lib/randevu-bridge";
import { cronRotasi, type CronKosusu } from "@/lib/cron-kaydi";

// Randevu köprüsünün tam eşitlemesi (lib/randevu-bridge.ts). Vercel zamanlayıcısı
// 10 dakikada bir çağırır (vercel.json). Anında aktarımın kaçırdığı her
// değişikliği yakalar: üyeliği veritabanı tetikleyicisiyle değişen personel,
// kurum bilgisi, süresi dolan lisans, başarısız olmuş anında çağrılar.
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

// Koşma kaydı lib/cron-kaydi ile; yetkisiz istek kaydedilmez.
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Yetkisiz", { status: 401 });
  return cronRotasi("/api/cron/randevu-sync", kosu);
}

async function kosu(): Promise<CronKosusu> {
  const result = await syncRandevuTenants();
  // Kısmi hata da başarısızlıktır: 200 dönmek Vercel'in zamanlayıcı
  // geçmişinde "sorun yok" gösteriyor, eksik kalan aktarım hiç fark edilmiyordu.
  const failed = result.status === "failed" || result.status === "partial";
  if (failed) console.error("[randevu] zamanlanmış eşitleme eksik", result.status, result.errors);
  /* "not_configured" işin kendisi için başarı (gerekçe arc-sync rotasında). */
  return {
    yanit: Response.json(result, { status: failed ? 500 : 200, headers: { "Cache-Control": "no-store" } }),
    sonuc: result.status === "failed" ? "hata" : result.status === "partial" ? "eksik" : "tamam",
    ayrinti: { durum: result.status, kurum: result.organizations, uyelik: result.memberships, hata: result.errors.slice(0, 5) },
  };
}
