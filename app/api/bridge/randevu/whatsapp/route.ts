import { randevuBridgeAuthorized } from "@/lib/randevu-bridge-auth";
import { canManageMembers } from "@/lib/randevu-members";
import { HESAP_EYLEMLERI, whatsappHesapIslemi, type HesapEylemi } from "@/lib/whatsapp-hesap-kopru";

/*
  Randevu panelindeki "WhatsApp numarası" bölümünün arka ucu.

  Gövde lib/whatsapp-hesap-kopru.ts'te; burada yalnızca Randevu'ya
  özgü olan iki şey var: köprü yetkisi ve hangi rolün numara
  bağlayabildiği. ArvoARC'a aynı bölüm eklenirken gövde üçüncü kez
  kopyalanacaktı (17.10.2026).
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!randevuBridgeAuthorized(request)) return json(401, { error: "unauthorized" });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "") as HesapEylemi;
  const actorId = String(body?.actorId ?? "");
  const organizationId = String(body?.organizationId ?? "");
  if (!HESAP_EYLEMLERI.has(action) || !UUID.test(actorId) || !UUID.test(organizationId)) {
    return json(400, { error: "invalid_request" });
  }

  const sonuc = await whatsappHesapIslemi({
    eylem: action,
    organizationId,
    actorId,
    urun: "randevu",
    yetkiliMi: canManageMembers,
    wabaId: String(body?.wabaId ?? ""),
    phoneNumberId: String(body?.phoneNumberId ?? ""),
    accessToken: String(body?.accessToken ?? ""),
  });
  return json(sonuc.durum, sonuc.govde);
}
