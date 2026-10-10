import assert from "node:assert/strict";
import test from "node:test";
import { aramaDeseni, telefonAnahtari } from "@/lib/liste-arama";

test("desen PostgREST süzgecinin dilbilgisini bozmuyor", () => {
  /* Terimdeki virgül ya da parantez `or` süzgecini bölüp sorguyu
     hataya düşürüyordu; yüzde ve alt çizgi LIKE jokerleri. */
  assert.equal(aramaDeseni("Yılmaz, Ayşe (A.Ş.)"), "Yılmaz Ayşe A.Ş.");
  assert.equal(aramaDeseni("%_*"), null);
  assert.equal(aramaDeseni("a"), null, "tek harf aranmıyor");
  assert.equal(aramaDeseni("  tez  danışmanlığı  "), "tez danışmanlığı");
});

test("telefon araması veritabanındaki anahtara indirgeniyor", () => {
  /* Veritabanı telefonu arvo_search_digits ile on haneli yerel
     numaraya indiriyor; aynı indirgeme terime uygulanmazsa telefonla
     arama hiçbir şey bulmuyor. */
  assert.equal(telefonAnahtari("+90 (532) 111 22 33"), "5321112233");
  assert.equal(telefonAnahtari("0532 111 22 33"), "5321112233");
  assert.equal(telefonAnahtari("00905321112233"), "5321112233");
  assert.equal(telefonAnahtari("532 111"), "532111");
  // Çok kısa dizi bütün listeyi getirirdi.
  assert.equal(telefonAnahtari("12"), null);
  assert.equal(telefonAnahtari("Ayşe"), null);
});
