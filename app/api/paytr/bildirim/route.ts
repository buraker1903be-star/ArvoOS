import { createAdminClient } from "@/lib/supabase/admin";
import { direktBildirimiIsle } from "@/lib/paytr-kart-akisi";

// PayTR Direkt API bildirimi (herkese açık, giriş yok).
//
// Mağaza panelindeki "Bildirim URL" bugün /api/paytr/callback olarak
// ayarlı ve o rota callback_id'siz (Direkt API) bildirimi de buraya
// yönlendiriyor (28.10.2026) — panel ayarına dokunmak gerekmesin. Bu
// adres panelde doğrudan tanımlanırsa da aynı işlev çalışır.
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
