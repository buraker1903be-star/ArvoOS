import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { cronRotasi, type CronKosusu } from "@/lib/cron-kaydi";
import { kartSaklamaAcik, otomatikYenilemeAcik } from "@/lib/paytr-kart-akisi";
import { otomatikYenilemeleriIsle } from "@/lib/otomatik-yenileme-isi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/*
  OTOMATİK YENİLEME (28.10.2026). Her sabah 09:20 (Türkiye; vercel.json
  06:20 UTC) — abonelik hatırlatmasından sonra, mesai başlamadan:
  başarısız bir çekimin bildirimi kurumun gününe düşsün, gece yarısına
  değil. Kural lib/otomatik-yenileme.ts, iş lib/otomatik-yenileme-isi.ts.

  Bayrak kapalıyken (PAYTR_KART_SAKLAMA) iş koşar ve hiçbir şey yapmaz;
  koşma kaydı yine yazılır, iş "durmuş" görünmesin.
*/

function yetkili(istek: Request) {
  const sir = process.env.CRON_SECRET;
  const baslik = istek.headers.get("authorization") ?? "";
  if (!sir || !baslik.startsWith("Bearer ")) return false;
  const beklenen = Buffer.from(sir);
  const gelen = Buffer.from(baslik.slice("Bearer ".length));
  return beklenen.length === gelen.length && timingSafeEqual(beklenen, gelen);
}

export async function GET(istek: Request) {
  if (!yetkili(istek)) return Response.json({ hata: "yetkisiz" }, { status: 401 });
  return cronRotasi("/api/cron/otomatik-yenileme", kosu);
}

async function kosu(): Promise<CronKosusu> {
  // Daha önce onay vermiş müşteriler de dâhil, kapalıyken hiçbir karttan çekim yapılmaz.
  if (!kartSaklamaAcik() || !otomatikYenilemeAcik()) return { yanit: Response.json({ kapali: true }), sonuc: "tamam", ayrinti: { kapali: true } };
  const admin = createAdminClient();
  if (!admin) return { yanit: Response.json({ hata: "sunucu anahtarı yok" }, { status: 500 }), sonuc: "hata", ayrinti: { hata: "sunucu anahtarı yok" } };
  try {
    const ozet = await otomatikYenilemeleriIsle(admin, todayInIstanbul());
    if (ozet.hatalar.length) console.error("[otomatik-yenileme]", ozet.hatalar);
    const { hatalar, ...sayilar } = ozet;
    return {
      yanit: Response.json({ ...sayilar, hata: hatalar.length }, { status: hatalar.length ? 500 : 200 }),
      sonuc: hatalar.length ? "eksik" : "tamam",
      ayrinti: { ...sayilar, hata: hatalar.slice(0, 5) },
    };
  } catch (hata) {
    const mesaj = hata instanceof Error ? hata.message : String(hata);
    console.error("[otomatik-yenileme]", mesaj);
    return { yanit: Response.json({ hata: mesaj }, { status: 500 }), sonuc: "hata", ayrinti: { hata: mesaj } };
  }
}
