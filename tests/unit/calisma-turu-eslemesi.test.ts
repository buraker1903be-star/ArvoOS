import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { calismaTuruBul } from "@/lib/is-adimlari";

const turler = [
  { code: "tez", hizmet_turleri: ["Tez Danışmanlığı"] },
  { code: "makale", hizmet_turleri: ["Makale Danışmanlığı"] },
  { code: "ceviri", hizmet_turleri: ["Akademik Çeviri", "İngilizce Çeviri"] },
  { code: "bos", hizmet_turleri: null },
];

describe("hizmet türünden çalışma türü", () => {
  test("eşlenen hizmet türü kendi çalışma türünü seçer", () => {
    assert.equal(calismaTuruBul(turler, "Makale Danışmanlığı"), "makale");
    assert.equal(calismaTuruBul(turler, "Akademik Çeviri"), "ceviri");
  });

  test("büyük/küçük harf ve boşluk Türkçe kurallarıyla yok sayılır", () => {
    assert.equal(calismaTuruBul(turler, "  tez danışmanlığı "), "tez");
    assert.equal(calismaTuruBul(turler, "İNGİLİZCE ÇEVİRİ"), "ceviri");
  });

  test("eşlenmemiş ya da boş hizmet türü: seçim yok (öntanımlı kalır)", () => {
    assert.equal(calismaTuruBul(turler, "Veri Analizi"), null);
    assert.equal(calismaTuruBul(turler, ""), null);
    assert.equal(calismaTuruBul(turler, null), null);
  });
});
