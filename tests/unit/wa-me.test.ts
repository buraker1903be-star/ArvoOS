import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { waMeAdresi } from "@/lib/wa-me";

describe("WhatsApp Web bağlantısı", () => {
  test("numara bağlantıya yazılır", () => {
    /*
      Eskiden numara yoktu ve WhatsApp "kime göndereceksiniz" diye
      soruyordu; teklif yanlış kişiye üç tıkla gidebiliyordu.
    */
    assert.match(waMeAdresi("0532 111 22 33", "merhaba"), /^https:\/\/wa\.me\/905321112233\?text=merhaba$/);
  });

  test("ülke kodlu numara da tanınır", () => {
    assert.match(waMeAdresi("905321112233", "x"), /wa\.me\/905321112233\?/);
  });

  test("cep olmayan numarada numarasız bağlantı döner", () => {
    // Sabit hat: gönderimi büsbütün engellemek yerine elle seçtiriyoruz.
    assert.equal(waMeAdresi("0212 555 44 33", "x"), "https://wa.me/?text=x");
  });

  test("telefon yoksa numarasız bağlantı döner", () => {
    assert.equal(waMeAdresi(null, "x"), "https://wa.me/?text=x");
  });

  test("metin adres için kodlanır", () => {
    // Satır sonu ve & gibi karakterler bağlantıyı bozuyordu.
    assert.match(waMeAdresi("05321112233", "a b&c\nd"), /text=a%20b%26c%0Ad$/);
  });
});
