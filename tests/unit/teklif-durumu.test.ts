import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { etkinTeklifDurumu, TEKLIF_DURUM_ADI, TEKLIF_DURUMLARI } from "../../lib/teklif-durumu";

describe("teklifin etkin durumu", () => {
  it("arşiv sebebindeki gerçek durumu çıkarır", () => {
    /*
      Tetikleyici kabul/ret/süresi geçmiş teklifi 'archived' yapıp
      asıl durumu archive_reason'a yazıyor. `status = 'accepted'`
      arayan sorgu HİÇ satır bulmaz ve hata vermez — dönüşüm oranı
      her zaman %0 çıkar.
    */
    assert.equal(etkinTeklifDurumu("archived", "accepted"), "accepted");
    assert.equal(etkinTeklifDurumu("archived", "rejected"), "rejected");
    assert.equal(etkinTeklifDurumu("archived", "expired"), "expired");
  });

  it("elle arşivlenen teklifi arşiv sayar", () => {
    assert.equal(etkinTeklifDurumu("archived", "manual"), "archived");
    assert.equal(etkinTeklifDurumu("archived", null), "archived");
  });

  it("arşivlenmemiş durumu olduğu gibi bırakır", () => {
    assert.equal(etkinTeklifDurumu("draft", null), "draft");
    assert.equal(etkinTeklifDurumu("sent", null), "sent");
    // Sebep dolu olsa da status arşiv değilse sebep okunmaz.
    assert.equal(etkinTeklifDurumu("sent", "accepted"), "sent");
  });

  it("tanınmayan durumu arşive düşürür — uydurma durum üretmez", () => {
    assert.equal(etkinTeklifDurumu("__proto__", null), "archived");
    assert.equal(etkinTeklifDurumu("", null), "archived");
  });

  it("her durumun Türkçe adı var", () => {
    for (const durum of TEKLIF_DURUMLARI) {
      assert.equal(typeof TEKLIF_DURUM_ADI[durum], "string");
      assert.ok(TEKLIF_DURUM_ADI[durum].length > 0, `${durum} adsız`);
    }
  });
});
