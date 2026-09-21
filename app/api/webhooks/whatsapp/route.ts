import { applyWebhook } from "@/lib/whatsapp-inbox";
import { parseWhatsappWebhook, verifyWebhookSignature } from "@/lib/whatsapp-webhook";

/*
  Meta WhatsApp bildirim ucu (herkese açık, giriş yok).

  GET  — Meta'nın abonelik el sıkışması: hub.verify_token bizimkiyle
         eşleşirse hub.challenge aynen geri döner.
  POST — gelen mesaj ve durum bildirimi.

  Güvenlik tamamen X-Hub-Signature-256'ya dayanır (WHATSAPP_APP_SECRET).
  İmzasız bırakmak "müşteriniz şunu yazdı" diyen sahte kaydı herkese açık
  bırakırdı. İmza ham gövdeyle hesaplanır: JSON'u çözüp yeniden dizmek
  boşlukları değiştirir ve imza tutmaz.

  İşleyemediğimiz gövdeye bile 200 dönüyoruz: Meta 200 almadığı bildirimi
  saatlerce yeniden dener ve sonunda aboneliği askıya alır. Gerçek sorun
  günlüğe yazılır; yeniden denenmesi işe yarayacak tek durum (sunucu anahtarı
  yok / veritabanı düştü) 500 ile geri çevrilir.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  const gelen = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (!token || url.searchParams.get("hub.mode") !== "subscribe" || gelen !== token) {
    return new Response("forbidden", { status: 403 });
  }
  // Meta yanıtın yalnızca challenge olmasını bekler; JSON'a sarılırsa reddeder.
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.error("[whatsapp] WHATSAPP_APP_SECRET tanımlı değil; bildirim doğrulanamıyor");
    return new Response("not configured", { status: 503 });
  }

  const ham = await request.text();
  if (!verifyWebhookSignature(ham, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(ham);
  } catch {
    console.warn("[whatsapp] bildirim gövdesi çözülemedi");
    return new Response("ok", { status: 200 });
  }

  const cozulmus = parseWhatsappWebhook(payload);
  if (!cozulmus.inbound.length && !cozulmus.statuses.length) return new Response("ok", { status: 200 });

  try {
    await applyWebhook(cozulmus);
  } catch (hata) {
    // Yeniden denenmesi işe yarar: anahtar yok ya da veritabanına ulaşılamadı.
    console.error("[whatsapp] bildirim işlenemedi", hata);
    return new Response("retry", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
