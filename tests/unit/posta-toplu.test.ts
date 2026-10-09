import assert from "node:assert/strict";
import test from "node:test";
import { TOPLU_SINIR, topluSecim, topluSonucMetni } from "@/lib/posta-toplu";

/* Toplu posta işlemlerinin saf kısmı: seçim ve sonuç metni. */

test("seçim temizleniyor ve tekilleşiyor", () => {
  assert.deepEqual(topluSecim([" t1 ", "t2", "t1", "", null, undefined]), ["t1", "t2"]);
});

test("boş seçim ve sınır Türkçe hata veriyor", () => {
  assert.throws(() => topluSecim([]), /Önce yazışma seçin/);
  assert.throws(() => topluSecim(["   ", ""]), /Önce yazışma seçin/);
  const fazla = Array.from({ length: TOPLU_SINIR + 1 }, (_, i) => `t${i}`);
  assert.throws(() => topluSecim(fazla), /en fazla 50 yazışma/);
  // Yineleme sınırı aşmıyor: tekilleştirmeden SONRA bakılıyor.
  assert.deepEqual(topluSecim(Array.from({ length: 60 }, () => "t1")), ["t1"]);
});

test("sonuç metni kısmi başarıyı başarısızlık gibi göstermiyor", () => {
  const basarili = (adet: number) => `${adet} yazışma işlendi`;
  assert.deepEqual(topluSonucMetni({ toplam: 3, olan: 3, hatalar: [], basarili }),
    { tur: "basari", metin: "3 yazışma işlendi" });
  const kismi = topluSonucMetni({ toplam: 3, olan: 2, hatalar: ["Gmail'e ulaşılamadı."], basarili });
  assert.equal(kismi.tur, "uyari");
  assert.match(kismi.metin, /3 yazışmadan 2 tanesi işlendi; 1 tanesi olmadı: Gmail'e ulaşılamadı\./);
});
