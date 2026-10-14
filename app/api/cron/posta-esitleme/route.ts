import { timingSafeEqual } from "node:crypto";
import { postalariEsitle } from "@/lib/posta-esitleme";
import { cronRotasi, type CronKosusu } from "@/lib/cron-kaydi";

/*
  Ortak posta kutularının zamanlanmış eşitlemesi (lib/posta-esitleme.ts).
  Vercel zamanlayıcısı İKİ dakikada bir çağırır (vercel.json). Bu yorum
  "on dakikada bir" diyordu ve 13.10.2026'da zamanlama sıklaştırılırken
  güncellenmedi; beklenen aralığı artık yorum değil vercel.json söylüyor
  (lib/cron-isleri).

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

// Koşma kaydı lib/cron-kaydi ile; yetkisiz istek kaydedilmez.
export async function GET(request: Request) {
  if (!yetkili(request)) return new Response("Yetkisiz", { status: 401 });
  return cronRotasi("/api/cron/posta-esitleme", kosu);
}

async function kosu(): Promise<CronKosusu> {
  const sonuc = await postalariEsitle();
  /* Kısmi hata da başarısızlıktır: 200 dönmek zamanlayıcı geçmişinde
     "sorun yok" gösteriyor ve eşitlenmeyen kutu fark edilmiyordu. */
  const dustu = sonuc.durum !== "tamam";
  if (dustu) console.error("[posta] eşitleme eksik", sonuc.durum, sonuc.hatalar);
  return {
    yanit: Response.json(sonuc, { status: dustu ? 500 : 200, headers: { "Cache-Control": "no-store" } }),
    sonuc: sonuc.durum === "basarisiz" ? "hata" : sonuc.durum === "kismi" ? "eksik" : "tamam",
    ayrinti: { durum: sonuc.durum, kutu: sonuc.kurum, mesaj: sonuc.mesaj, hata: sonuc.hatalar.slice(0, 5) },
  };
}
