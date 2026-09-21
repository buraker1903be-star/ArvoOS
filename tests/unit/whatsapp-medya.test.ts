import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseWhatsappWebhook } from "@/lib/whatsapp-webhook";
import { mediaMessageBody } from "@/lib/whatsapp-send";
import { gorunenDosyaAdi, uzanti } from "@/lib/whatsapp-medya";

const bildirim = (message: Record<string, unknown>) => ({
  entry: [{
    changes: [{
      field: "messages",
      value: {
        metadata: { phone_number_id: "123" },
        messages: [{ id: "wamid.1", from: "905321234567", timestamp: "1758000000", ...message }],
      },
    }],
  }],
});

describe("gelen medyanın çözümlenmesi", () => {
  test("görselin kimliği ve türü okunur", () => {
    /*
      Eskiden medya kimliği okunmadan düşüyordu: panelde yalnızca "[görsel]"
      yazıyor, dosyaya sonradan da ulaşılamıyordu.
    */
    const { inbound } = parseWhatsappWebhook(
      bildirim({ type: "image", image: { id: "media-1", mime_type: "image/jpeg", sha256: "abc" } }),
    );
    assert.deepEqual(inbound[0].media, { id: "media-1", mime: "image/jpeg", filename: null, sha256: "abc" });
  });

  test("belgenin dosya adı korunur", () => {
    // Görselde Meta ad vermiyor, belgede veriyor; müşterinin gördüğü ad bu.
    const { inbound } = parseWhatsappWebhook(
      bildirim({ type: "document", document: { id: "m2", mime_type: "application/pdf", filename: "dekont.pdf" } }),
    );
    assert.equal(inbound[0].media?.filename, "dekont.pdf");
  });

  test("mime türündeki charset eki atılır", () => {
    // "text/plain; charset=utf-8" kova MIME beyaz listesine takılıyordu.
    const { inbound } = parseWhatsappWebhook(
      bildirim({ type: "document", document: { id: "m3", mime_type: "text/plain; charset=utf-8" } }),
    );
    assert.equal(inbound[0].media?.mime, "text/plain");
  });

  test("altyazı gövdeye yazılmaya devam eder", () => {
    const { inbound } = parseWhatsappWebhook(
      bildirim({ type: "image", image: { id: "m4", caption: "dekont ektedir" } }),
    );
    assert.equal(inbound[0].body, "[görsel] dekont ektedir");
  });

  test("metin mesajında medya yoktur", () => {
    const { inbound } = parseWhatsappWebhook(bildirim({ type: "text", text: { body: "merhaba" } }));
    assert.equal(inbound[0].media, null);
  });

  test("kimliksiz medya yok sayılır", () => {
    // Kimliksiz kayıt, ekranda indirilemeyecek bir dosya düğmesi demekti.
    const { inbound } = parseWhatsappWebhook(bildirim({ type: "image", image: { mime_type: "image/png" } }));
    assert.equal(inbound[0].media, null);
    // Mesajın kendisi yine de kaydedilir.
    assert.equal(inbound[0].body, "[görsel]");
  });

  test("konum ve kişi kartı medya sayılmaz", () => {
    // Dosya değil, veri taşıyorlar; indirilecek bir şey yok.
    const { inbound } = parseWhatsappWebhook(bildirim({ type: "location", location: { latitude: 41, longitude: 29 } }));
    assert.equal(inbound[0].media, null);
  });
});

describe("giden medya gövdesi", () => {
  test("görselde altyazı gider, dosya adı gitmez", () => {
    // Meta görselde filename görürse 131009 döndürüp mesajı hiç göndermiyor.
    const govde = mediaMessageBody({
      to: "905321234567",
      media: { kind: "image", id: "m1", caption: "fiyat listesi", filename: "liste.jpg" },
    }) as { type: string; image: Record<string, unknown> };

    assert.equal(govde.type, "image");
    assert.equal(govde.image.caption, "fiyat listesi");
    assert.ok(!("filename" in govde.image));
  });

  test("belgede dosya adı da gider", () => {
    const govde = mediaMessageBody({
      to: "905321234567",
      media: { kind: "document", id: "m2", filename: "teklif.pdf", caption: "teklifiniz" },
    }) as { document: Record<string, unknown> };

    assert.equal(govde.document.filename, "teklif.pdf");
    assert.equal(govde.document.caption, "teklifiniz");
  });

  test("ses mesajında altyazı gönderilmez", () => {
    const govde = mediaMessageBody({
      to: "905321234567",
      media: { kind: "audio", id: "m3", caption: "dinleyin" },
    }) as { audio: Record<string, unknown> };

    assert.deepEqual(govde.audio, { id: "m3" });
  });

  test("boş altyazı hiç eklenmez", () => {
    const govde = mediaMessageBody({
      to: "905321234567",
      media: { kind: "image", id: "m4", caption: "   " },
    }) as { image: Record<string, unknown> };

    assert.deepEqual(govde.image, { id: "m4" });
  });
});

describe("dosya adı ve uzantı", () => {
  test("bilinen mime uzantıya çevrilir", () => {
    assert.equal(uzanti("image/jpeg"), "jpg");
    assert.equal(uzanti("application/pdf"), "pdf");
  });

  test("tanınmayan mime'da dosya adındaki uzantı kullanılır", () => {
    assert.equal(uzanti("application/x-bilinmeyen", "kayit.dwg"), "dwg");
  });

  test("hiçbir ipucu yoksa bin", () => {
    // Uzantısız dosya indirilince açılmıyor; "bin" en azından bir ad veriyor.
    assert.equal(uzanti(null), "bin");
  });

  test("adsız görsele türünden ad üretilir", () => {
    assert.equal(gorunenDosyaAdi("image", "image/png", null), "gorsel.png");
  });

  test("Meta'nın verdiği ad her zaman korunur", () => {
    assert.equal(gorunenDosyaAdi("document", "application/pdf", "dekont.pdf"), "dekont.pdf");
  });
});
