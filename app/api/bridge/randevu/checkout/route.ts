import { createAdminClient } from "@/lib/supabase/admin";
import { CheckoutError, createLicenseCheckout } from "@/lib/license-checkout";
import { randevuBridgeAuthorized } from "@/lib/randevu-bridge-auth";
import { canManageMembers } from "@/lib/randevu-members";

// Randevu panelinden abonelik ödemesi: salon ArvoOS'a girmeden kartla öder.
// Randevu sunucusu kimin istediğini (actorId, kendi oturumundan) ve salonu
// gönderir; burada kişinin ArvoOS'ta o kurumda sahip/yönetici olduğu
// denetlenir, PayTR bağlantısı lib/license-checkout.ts ile açılır ve adresi
// döner. Tutar yalnızca ArvoOS'taki lisanstan gelir.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!randevuBridgeAuthorized(request)) return json(401, { error: "unauthorized" });
  const body = (await request.json().catch(() => null)) as { actorId?: string; organizationId?: string } | null;
  const actorId = String(body?.actorId ?? "");
  const organizationId = String(body?.organizationId ?? "");
  if (!UUID.test(actorId) || !UUID.test(organizationId)) return json(400, { error: "invalid_ids" });

  const admin = createAdminClient();
  if (!admin) return json(503, { error: "unavailable" });

  const [license, actor] = await Promise.all([
    admin.from("organization_product_licenses").select("status").eq("organization_id", organizationId).eq("product", "randevu").maybeSingle(),
    admin.from("organization_memberships").select("role,is_active").eq("organization_id", organizationId).eq("user_id", actorId).maybeSingle(),
  ]);
  if (!license.data) return json(404, { error: "no_license" });
  if (!actor.data?.is_active || !canManageMembers(actor.data.role)) return json(403, { error: "forbidden" });

  try {
    const { url } = await createLicenseCheckout(admin, { organizationId, product: "randevu", actorId });
    return json(200, { checkoutUrl: url });
  } catch (error) {
    if (error instanceof CheckoutError) return json(error.code === "fee_not_set" ? 409 : 503, { error: error.code, detail: error.message });
    console.error("[randevu] ödeme bağlantısı", organizationId, error);
    return json(500, { error: "failed" });
  }
}
