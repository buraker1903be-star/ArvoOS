import assert from "node:assert/strict";
import test from "node:test";
import { sureOlcer } from "@/lib/sure-olcumu";

test("eşiği aşınca okumaları en yavaş önce yazar; altında sessiz", async () => {
  let an = 0;
  const yazilan: string[] = [];
  const o = sureOlcer("deneme", { esikMs: 100, simdi: () => an, yaz: (m) => yazilan.push(m) });
  const hizli = o.olc("hizli", Promise.resolve(1));
  an = 30; await hizli;
  const yavas = o.olc("yavas", Promise.resolve(2));
  an = 150; assert.equal(await yavas, 2);
  const sonuc = o.bitir();
  assert.deepEqual(Object.keys(sonuc!.okumalar), ["yavas", "hizli"]);
  assert.equal(sonuc!.toplam, 150);
  assert.match(yazilan[0], /^\[süre\] deneme 150 ms /);

  const sessiz = sureOlcer("hizli-sayfa", { esikMs: 100, simdi: () => 0, yaz: (m) => yazilan.push(m) });
  assert.equal(sessiz.bitir(), null);
  assert.equal(yazilan.length, 1);
});

test("hata olduğu gibi geçer ve süresi yine kaydedilir", async () => {
  const o = sureOlcer("hata", { esikMs: 0, simdi: () => 0, yaz: () => {} });
  await assert.rejects(o.olc("dusen", Promise.reject(new Error("x"))), /x/);
  assert.ok("dusen" in o.bitir()!.okumalar);
});
