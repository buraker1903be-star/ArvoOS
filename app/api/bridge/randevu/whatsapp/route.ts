import { createAdminClient } from "@/lib/supabase/admin";
import { randevuBridgeAuthorized } from "@/lib/randevu-bridge-auth";
import { canManageMembers } from "@/lib/randevu-members";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { removeWhatsappAccountRow, saveWhatsappAccountRow, verifyWhatsappAccountRow } from "@/lib/whatsapp-account";
import { getWhatsappStatus } from "@/lib/whatsapp-status";

/*
  Randevu panelindeki "WhatsApp numarası" bölümünün arka ucu.

  Salon kendi numarasını Randevu'dan bağlar; kayıt yine ArvoOS'ta
  (whatsapp_accounts) durur, çünkü gönderim kapısı numarayı oradan bulur ve
  erişim anahtarı yalnızca ArvoOS'un şifreleme anahtarıyla saklanıyor.
  Salonu ArvoOS paneline göndermek için bir sebep yok: Kullanıcılar
  bölümüyle aynı yol.

  actorId'yi Randevu kendi oturumundan doğrular; burada o kişinin ArvoOS'ta
  bu kurumda sahip/yönetici olduğu ayrıca denetlenir. Erişim anahtarı
  hiçbir yanıtta dönmez (getWhatsappStatus onu hiç okumaz).
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["status", "save", "verify", "remove"]);

export async function POST(request: Request) {
  if (!randevuBridgeAuthorized(request)) return json(401, { error: "unauthorized" });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");
  const actorId = String(body?.actorId ?? "");
  const organizationId = String(body?.organizationId ?? "");
  if (!ACTIONS.has(action) || !UUID.test(actorId) || !UUID.test(organizationId)) return json(400, { error: "invalid_request" });

  const admin = createAdminClient();
  if (!admin) return json(503, { error: "unavailable" });
  // Anahtar şifresiz yazılmaz: şifreleme anahtarı yoksa bölüm hiç açılmaz.
  if (!paymentCredentialsConfigured()) return json(503, { error: "no_encryption_key" });

  const [license, actor] = await Promise.all([
    admin.from("organization_product_licenses").select("status").eq("organization_id", organizationId).eq("product", "randevu").maybeSingle(),
    admin.from("organization_memberships").select("role,is_active").eq("organization_id", organizationId).eq("user_id", actorId).maybeSingle(),
  ]);
  if (!license.data) return json(404, { error: "no_license" });
  if (!actor.data?.is_active || !canManageMembers(actor.data.role)) return json(403, { error: "forbidden" });

  try {
    if (action === "status") return json(200, { status: await getWhatsappStatus(organizationId) });

    if (action === "save") {
      await saveWhatsappAccountRow(admin, {
        organizationId,
        wabaId: String(body?.wabaId ?? "").replace(/\s/g, ""),
        phoneNumberId: String(body?.phoneNumberId ?? "").replace(/\s/g, ""),
        token: String(body?.accessToken ?? "").trim(),
        connectedBy: actorId,
      });
      return json(200, { status: await getWhatsappStatus(organizationId) });
    }

    if (action === "verify") {
      const sonuc = await verifyWhatsappAccountRow(admin, organizationId);
      // Doğrulanamadı da bir yanıt: durum kaydedildi, ekran sebebini göstersin.
      return json(200, { status: await getWhatsappStatus(organizationId), verified: sonuc.ok, detail: sonuc.error ?? null });
    }

    await removeWhatsappAccountRow(admin, organizationId);
    return json(200, { status: await getWhatsappStatus(organizationId) });
  } catch (hata) {
    // Meta'nın ve doğrulamanın Türkçe cümleleri olduğu gibi Randevu'ya geçer.
    const detail = hata instanceof Error ? hata.message : String(hata);
    console.error("[bridge/randevu/whatsapp]", action, detail);
    return json(400, { error: "whatsapp_failed", detail });
  }
}
