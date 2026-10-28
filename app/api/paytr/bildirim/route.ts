import { createAdminClient } from "@/lib/supabase/admin";
import { direktBildirimiIsle } from "@/lib/paytr-kart-akisi";

// PayTR Direkt API bildirimi (herkese açık, giriş yok). PayTR Mağaza
// Paneli → Destek & Kurulum → Ayarlar → Bildirim URL olarak bu adres
// tanımlanır: https://app.arvo-os.com/api/paytr/bildirim
//
// "Link ile Ödeme" bildirimi ayrı adrese gelir (/api/paytr/callback;
// adres her bağlantıyla birlikte gönderiliyor). İkisi ayrı tutuldu çünkü
// imza formülleri farklı: biri callback_id içeriyor, öteki içermiyor.
//
// Yanıt YALNIZCA düz "OK" olmalı; öncesinde ya da sonrasında hiçbir şey
// yazılmaz. OK dönmezsek PayTR yeniden dener ve işlem panelde "Devam
// Ediyor" kalır. Kural ve güvenlik lib/paytr-kart-akisi.ts'te.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const yanit = (durum: number, govde: string) =>
  new Response(govde, { status: durum, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return yanit(400, "invalid request");
  }
  const admin = createAdminClient();
  if (!admin) return yanit(503, "service unavailable"); // PayTR sonra yeniden dener
  const sonuc = await direktBildirimiIsle(admin, (ad) => String(form.get(ad) ?? "").trim());
  if (sonuc === "ok") return yanit(200, "OK");
  if (sonuc === "gecersiz") return yanit(400, "PAYTR notification failed: bad hash");
  return yanit(503, "try again");
}
