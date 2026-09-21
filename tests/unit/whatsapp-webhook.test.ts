// Meta bildirimlerinin çözümlenmesi ve imza doğrulaması.
//
// Uç herkese açık: imza tutmazsa "müşteriniz şunu yazdı" diyen sahte kayıt
// yazılabilirdi. Gövde çözümlemesi de kayıtsız kalmamalı; okunamayan bir
// alan yüzünden müşterinin mesajı sessizce düşerse gelen kutusu yalan söyler.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseWhatsappWebhook, statusErrorMessage, verifyWebhookSignature } from "../../lib/whatsapp-webhook";

const SECRET = "uygulama-sirri";
const imzala = (govde: string) => `sha256=${createHmac("sha256", SECRET).update(govde, "utf8").digest("hex")}`;

const bildirim = (value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "555000" }, ...value } }] }],
});

test("imza ham gövdeyle doğrulanır, oynanmış gövde reddedilir", () => {
  const govde = JSON.stringify(bildirim({}));
  assert.equal(verifyWebhookSignature(govde, imzala(govde), SECRET), true);
  assert.equal(verifyWebhookSignature(`${govde} `, imzala(govde), SECRET), false);
  assert.equal(verifyWebhookSignature(govde, "sha256=deadbeef", SECRET), false);
  assert.equal(verifyWebhookSignature(govde, null, SECRET), false);
  // Sır tanımlı değilken hiçbir şey doğrulanmış sayılmaz.
  assert.equal(verifyWebhookSignature(govde, imzala(govde), ""), false);
});

test("gelen metin mesajı profil adı ve zamanıyla çözülür", () => {
  const { inbound } = parseWhatsappWebhook(bildirim({
    contacts: [{ wa_id: "905320000000", profile: { name: "Ayşe" } }],
    messages: [{ from: "905320000000", id: "wamid.1", timestamp: "1758000000", type: "text", text: { body: " gelemeyeceğim " } }],
  }));
  assert.equal(inbound.length, 1);
  assert.deepEqual(
    { ...inbound[0], sentAt: inbound[0].sentAt.slice(0, 4) },
    { phoneNumberId: "555000", waMessageId: "wamid.1", from: "905320000000", profileName: "Ayşe", type: "text", body: "gelemeyeceğim", sentAt: "2025" },
  );
});

test("metin dışı mesaj yer tutucuyla gelir, alt yazı korunur", () => {
  const { inbound } = parseWhatsappWebhook(bildirim({
    messages: [
      { from: "905320000000", id: "wamid.2", type: "image", image: { caption: "dekont" } },
      { from: "905320000000", id: "wamid.3", type: "document" },
      { from: "905320000000", id: "wamid.4", type: "interactive", interactive: { button_reply: { title: "Onaylıyorum" } } },
    ],
  }));
  assert.deepEqual(inbound.map((m) => m.body), ["[görsel] dekont", "[belge]", "Onaylıyorum"]);
});

test("kimliksiz mesaj ve tanınmayan alan atlanır, istek düşmez", () => {
  const { inbound, statuses } = parseWhatsappWebhook({
    entry: [
      { changes: [{ field: "message_template_status_update", value: { event: "APPROVED" } }] },
      { changes: [{ field: "messages", value: { metadata: { phone_number_id: "555000" }, messages: [{ type: "text", text: { body: "kimliksiz" } }] } }] },
    ],
  });
  assert.deepEqual(inbound, []);
  assert.deepEqual(statuses, []);
  // Gövde hiç beklediğimiz biçimde değilse de patlamaz.
  assert.deepEqual(parseWhatsappWebhook(null), { inbound: [], statuses: [] });
});

test("durum bildirimi okunur; hatasız bildirime hata uydurulmaz", () => {
  const { statuses } = parseWhatsappWebhook(bildirim({
    statuses: [
      { id: "wamid.1", status: "delivered", timestamp: "1758000000" },
      { id: "wamid.2", status: "failed", timestamp: "1758000001", errors: [{ code: 131047, title: "Re-engagement message" }] },
      { id: "wamid.3", status: "deleted" },
    ],
  }));
  assert.deepEqual(statuses.map((s) => [s.waMessageId, s.status, s.error]), [
    ["wamid.1", "delivered", null],
    ["wamid.2", "failed", "24 saatlik pencere kapalı: serbest metin gönderilemez, onaylı şablon gerekir."],
  ]);
});

test("bilinmeyen hata kodunda Meta'nın kendi metni kalır", () => {
  assert.equal(statusErrorMessage({ code: 999, message: "Something went wrong" }), "Something went wrong");
  assert.equal(statusErrorMessage(undefined), null);
});
