import { timingSafeEqual } from "node:crypto";
import { postalariEsitle } from "@/lib/posta-esitleme";

/*
  Ortak posta kutularının zamanlanmış eşitlemesi (lib/posta-esitleme.ts).
  Vercel zamanlayıcısı 10 dakikada bir çağırır (vercel.json).

  Vercel isteğe "Authorization: Bearer <CRON_SECRET>" ekler. CRON_SECRET
  tanımlı değilse uç kapalıdır (kapalı başarısızlık) — kutunun içeriğini
  dışarıdan tetiklenebilir bir uçla taratmak istemiyoruz.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Çok kurumlu eşitleme mesaj başına bir istek atıyor; varsayılan 10 saniye yetmiyor.
export const maxDuration = 300;

function yetkili(request: Request) {
  const sir = process.env.CRON_SECRET;
  const baslik = request.headers.get("authorization") ?? "";
  if (!sir || !baslik.startsWith("Bearer ")) return false;
  const beklenen = Buffer.from(sir);
  const gelen = Buffer.from(baslik.slice("Bearer ".length));
  return beklenen.length === gelen.length && timingSafeEqual(beklenen, gelen);
}

export async function GET(request: Request) {
  if (!yetkili(request)) return new Response("Yetkisiz", { status: 401 });
  const sonuc = await postalariEsitle();
  /* Kısmi hata da başarısızlıktır: 200 dönmek zamanlayıcı geçmişinde
     "sorun yok" gösteriyor ve eşitlenmeyen kutu fark edilmiyordu. */
  const dustu = sonuc.durum !== "tamam";
  if (dustu) console.error("[posta] eşitleme eksik", sonuc.durum, sonuc.hatalar);
  return Response.json(sonuc, { status: dustu ? 500 : 200, headers: { "Cache-Control": "no-store" } });
}
