import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { HAZIR_YANITLAR, hitapAdi, yanitaEkle } from "@/lib/hazir-yanitlar";

describe("hazır yanıtlar", () => {
  test("boş alanda ilk adla hitap edip cümleyi küçük harfle sürdürür", () => {
    assert.equal(
      yanitaEkle("", "Mesajınızı aldık.", "Rümeysa Akın"),
      "Merhaba Rümeysa, mesajınızı aldık.",
    );
  });

  test("Türkçe büyük İ küçülürken i olur (I → ı değil)", () => {
    assert.equal(yanitaEkle("", "İstediğiniz dosya hazır.", "Ali Can"), "Merhaba Ali, istediğiniz dosya hazır.");
  });

  test("ad yoksa ya da kurum içi işse hitap yok", () => {
    assert.equal(yanitaEkle("", "Teşekkürler.", null), "Teşekkürler.");
    assert.equal(yanitaEkle("", "Teşekkürler.", "Kurum içi iş"), "Teşekkürler.");
    assert.equal(hitapAdi("Müşteri"), null);
  });

  test("personelin yazdığı silinmez; cümle sona eklenir", () => {
    assert.equal(yanitaEkle("Merhaba,  ", "Teşekkürler.", "Ali"), "Merhaba, Teşekkürler.");
  });

  test("aynı cümleye iki kez dokunmak ikinci kez eklemez", () => {
    const bir = yanitaEkle("", HAZIR_YANITLAR[0].metin, "Ali");
    assert.equal(yanitaEkle(bir, HAZIR_YANITLAR[0].metin, "Ali"), bir);
  });

  test("her hazır yanıt sunucunun sınırları içinde (2–2000 karakter)", () => {
    for (const y of HAZIR_YANITLAR) {
      assert.ok(y.metin.length >= 2 && y.metin.length <= 2000);
      assert.ok(y.etiket.length <= 20, `${y.etiket}: düğme telefonda taşar`);
    }
  });
});
