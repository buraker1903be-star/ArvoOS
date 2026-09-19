import { timingSafeEqual } from "node:crypto";
import { syncRandevuTenants } from "@/lib/randevu-bridge";

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

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Yetkisiz", { status: 401 });
  const result = await syncRandevuTenants();
  return Response.json(result, { status: result.status === "failed" ? 500 : 200, headers: { "Cache-Control": "no-store" } });
}
