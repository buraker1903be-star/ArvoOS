import { KOPRU_URUNLERI, kopruYetkili, type KopruUrunu } from "@/lib/kopru-yetki";
import { HESAP_EYLEMLERI, whatsappHesapIslemi, type HesapEylemi } from "@/lib/whatsapp-hesap-kopru";

/*
  ÜRÜN PANELİNDEN WHATSAPP NUMARASI BAĞLAMA (Randevu dışındakiler).

  NEDEN VAR: numara kaydı ArvoOS'ta duruyor ve bugüne kadar yalnızca
  ArvoOS panelinden bağlanabiliyordu. Oysa ArvoARC hizmeti alan bir
  müşterinin ArvoOS paneli OLMAYABİLİR — o müşteri numarasını hiçbir
  yerden bağlayamıyor, bildirim özelliği kendisine kapalı kalıyordu.
  Randevu'da aynı sorun daha önce çözülmüştü; bu uç aynı gövdeyi
  Randevu dışındaki ürünlere açıyor.

  Yetki iki kademeli: köprü anahtarı ürünün kimliğini, membership
  denetimi de kişinin kurumdaki rolünü doğruluyor. Ürünün sözüne
  güvenmek, ürün sırrı sızdığında herkesin numarasını
  değiştirebilmesi demekti.

  Randevu BU UCU KULLANMAZ: onun kendi anahtarı var
  (RANDEVU_BRIDGE_SECRET) ve biri sızarsa öteki ürün açılmasın diye
  ayrı tutuluyor.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
  Numara bağlamak ayar işidir: kurumun sahibi ve yöneticisi yapar.
  Ürünlerin rol adları ortak (organization_memberships.role), o
  yüzden karar burada tek yerde.
*/
const YETKILI_ROLLER = new Set(["owner", "admin"]);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const product = String(body?.product ?? "") as KopruUrunu;
  if (!KOPRU_URUNLERI.includes(product) || product === "randevu") {
    return json(400, { error: "invalid_product" });
  }
  if (!kopruYetkili(request, product)) return json(401, { error: "unauthorized" });

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
    urun: product,
    yetkiliMi: (rol) => YETKILI_ROLLER.has(rol),
    wabaId: String(body?.wabaId ?? ""),
    phoneNumberId: String(body?.phoneNumberId ?? ""),
    accessToken: String(body?.accessToken ?? ""),
  });
  return json(sonuc.durum, sonuc.govde);
}
