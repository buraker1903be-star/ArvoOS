import assert from "node:assert/strict";
import test from "node:test";
import { odemeBaglantisiMesaji, odemeTutari, paytrBaglantiParcasi } from "@/lib/odeme-baglantisi";

test("şablon düğmesine yalnızca PayTR bağlantısının sonu gider", () => {
  assert.equal(paytrBaglantiParcasi("https://www.paytr.com/link/AbC123"), "AbC123");
  // Taban değişirse yanlış adrese düğme göndermek yerine null.
  assert.equal(paytrBaglantiParcasi("https://paytr.com/link/AbC123"), null);
  assert.equal(paytrBaglantiParcasi("https://www.paytr.com/link/"), null);
  assert.equal(paytrBaglantiParcasi("https://www.paytr.com/link/a/../b"), null);
});

test("mesaj tutarı kuruştan Türkçe biçimde yazar", () => {
  assert.equal(odemeTutari(500000), "₺5.000,00");
  assert.equal(odemeTutari(1250), "₺12,50");
  const { konu, metin } = odemeBaglantisiMesaji({ kurum: "AkademikMerkez", musteri: "Ayşe Yılmaz", tutarKurus: 500000, aciklama: "Kalan ödeme", url: "https://www.paytr.com/link/x1" });
  assert.equal(konu, "Ödeme bağlantınız — AkademikMerkez");
  assert.match(metin, /^Sayın Ayşe Yılmaz,/);
  assert.match(metin, /₺5\.000,00 tutarındaki ödemenizi \(Kalan ödeme\)/);
  assert.match(metin, /https:\/\/www\.paytr\.com\/link\/x1/);
  assert.match(metin, /AkademikMerkez$/);
});

test("müşteri adı ve açıklama yoksa genel hitap", () => {
  const { metin } = odemeBaglantisiMesaji({ kurum: "K", musteri: " ", tutarKurus: 100, url: "https://www.paytr.com/link/x" });
  assert.match(metin, /^Sayın Yetkili,/);
  assert.match(metin, /₺1,00 tutarındaki ödemenizi aşağıdaki/);
});
