import { timingSafeEqual } from "node:crypto";
import { GatewayError, sendThroughGateway, type GatewayProduct, type GatewaySender } from "@/lib/whatsapp-gateway";

/*
  Dört ürünün WhatsApp gönderim kapısı.

  Ürünler (Randevu, Arc, ArvoLab ve ArvoOS'un kendi işleri) Meta'ya değil
  buraya çağırır. Neden: tek yerde erişim anahtarı, tek yerde mesaj kaydı,
  tek yerde hata haritası. Dört ürün ayrı ayrı Meta'ya konuşsaydı dört yerde
  token, dört ayrı hata yönetimi ve dağınık kayıt olurdu.

  Yetki: ürün başına ayrı gizli anahtar (x-arvo-bridge-secret). Randevu
  RANDEVU_BRIDGE_SECRET, diğerleri PRODUCT_BRIDGE_SECRET kullanır; biri
  sızarsa diğer ürün açılmasın. Anahtarı tanımlı olmayan ürün kapalıdır.

  Gövde:
    { product, organizationId, sender?, messages: [{ ref?, to, template, params?, language?, body? }] }
  Yanıt:
    { sender, fellBackToArvo, results: [{ ref, to, sent, waMessageId?, error? }] }
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const PRODUCTS: GatewayProduct[] = ["arvoos", "arvolab", "arc", "randevu"];

/** Ürünün kendi anahtarı; Randevu'nunki ayrı (lib/randevu-bridge-auth.ts ile aynı değer). */
function secretFor(product: GatewayProduct): string | undefined {
  return product === "randevu" ? process.env.RANDEVU_BRIDGE_SECRET : process.env.PRODUCT_BRIDGE_SECRET;
}

function authorized(request: Request, product: GatewayProduct) {
  const secret = secretFor(product);
  const sent = request.headers.get("x-arvo-bridge-secret");
  if (!secret || !sent) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(sent);
  // Uzunluk farkı timingSafeEqual'i patlatır; önce onu eşitle.
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    product?: string; organizationId?: string; sender?: string; messages?: unknown;
  } | null;
  if (!body) return json(400, { error: "Geçersiz istek gövdesi." });

  const product = body.product as GatewayProduct;
  if (!PRODUCTS.includes(product)) return json(400, { error: "Geçersiz ürün." });
  // Yetkisizlikte ürün adını doğrulamadan önce sızdırmamak için tek mesaj.
  if (!authorized(request, product)) return json(401, { error: "Yetkisiz." });

  const sender = body.sender as GatewaySender | undefined;
  if (sender && sender !== "organization" && sender !== "arvo") return json(400, { error: "Geçersiz gönderen." });
  if (!Array.isArray(body.messages) || !body.messages.length) return json(400, { error: "Gönderilecek mesaj yok." });
  if (body.messages.length > 200) return json(400, { error: "Tek çağrıda en fazla 200 mesaj gönderilebilir." });

  try {
    const sonuc = await sendThroughGateway({
      product,
      organizationId: String(body.organizationId ?? ""),
      sender,
      messages: body.messages as Parameters<typeof sendThroughGateway>[0]["messages"],
    });
    // Kısmi başarısızlık 200 değil: ürün "hepsi gitti" sanmasın.
    const eksik = sonuc.results.some((r) => !r.sent);
    return json(eksik ? 207 : 200, sonuc);
  } catch (hata) {
    if (hata instanceof GatewayError) return json(hata.status, { error: hata.message });
    console.error("[whatsapp] kapı hatası", hata);
    return json(500, { error: "WhatsApp gönderimi tamamlanamadı." });
  }
}
