import assert from "node:assert/strict";
import test from "node:test";
import { ara, eslesmePuani, sadelestir } from "@/lib/konsol-arama";

test("Türkçe duyarsız", () => {
  assert.equal(sadelestir("İŞÇİ Şirketi"), "isci sirketi");
  assert.ok(eslesmePuani("Akademik Merkez Şirketi", [], "sirket") > 0);
  assert.ok(eslesmePuani("ISPARTA", [], "ısparta") > 0);
});

test("bütün kelimeler, sıra önemsiz; sıralama ad başlangıcı > adda > başka alanda", () => {
  assert.equal(eslesmePuani("Akademik Merkez", [], "merkez akademik"), 2);
  assert.equal(eslesmePuani("Akademik Merkez", [], "akademik me"), 3);
  assert.equal(eslesmePuani("Akademik Merkez", ["info@akademik.com"], "info"), 1);
  assert.equal(eslesmePuani("Akademik Merkez", [], "ankara"), 0);
  const sonuc = ara([{ ad: "Yeni Akademi" }, { ad: "Akademi Plus" }, { ad: "Başka", e: "akademi@x.com" }], "akademi", (x) => ({ ad: x.ad, diger: ["e" in x ? x.e : null] }));
  assert.deepEqual(sonuc.map((x) => x.ad), ["Akademi Plus", "Yeni Akademi", "Başka"]);
});

test("telefonla arama rakamlardan, baştaki sıfır ve +90 farkı önemsiz", () => {
  assert.equal(eslesmePuani("Kurum", ["+90 532 111 22 33"], "0532 111"), 1);
  assert.equal(eslesmePuani("Kurum", ["+90 532 111 22 33"], "0533"), 0);
});
