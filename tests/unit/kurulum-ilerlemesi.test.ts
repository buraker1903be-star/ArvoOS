import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kurulumIlerlemesi } from "@/lib/kurulum-ilerlemesi";

/*
  OS-03 (09.11.2026): ana ekran kurulum kartı. Gözlenen: beş kart, ekip
  daveti isteğe bağlı; iki kart tamamlanmış görünürken sayaç 1/4.
*/
const adimlar = (ekipYapildi: boolean, zorunluTamam: number) => [
  { key: "kurum", done: zorunluTamam > 0 },
  { key: "resmi", done: zorunluTamam > 1 },
  { key: "kimlik", done: zorunluTamam > 2 },
  { key: "ekip", done: ekipYapildi, optional: true },
  { key: "talep", done: zorunluTamam > 3 },
];

describe("kurulum ilerlemesi", () => {
  test("isteğe bağlı adım tamamlanmış olsa da zorunlu ilerlemeyi etkilemez (gözlenen 1/4)", () => {
    const ilerleme = kurulumIlerlemesi(adimlar(true, 1));
    assert.equal(ilerleme.toplam, 4);
    assert.equal(ilerleme.tamamlanan, 1);
    assert.equal(ilerleme.yuzde, 25);
    assert.equal(ilerleme.ozet, "4 zorunlu adımdan 1 tanesi tamamlandı");
    assert.deepEqual(ilerleme.zorunlu.map((a) => a.key), ["kurum", "resmi", "kimlik", "talep"]);
    assert.deepEqual(ilerleme.istegeBagli.map((a) => a.key), ["ekip"]);
    assert.equal(ilerleme.bitti, false);
  });

  test("isteğe bağlı adım yapılsa da yapılmasa da sayılar aynı", () => {
    const yapildi = kurulumIlerlemesi(adimlar(true, 2));
    const yapilmadi = kurulumIlerlemesi(adimlar(false, 2));
    assert.equal(yapildi.tamamlanan, yapilmadi.tamamlanan);
    assert.equal(yapildi.yuzde, yapilmadi.yuzde);
    assert.equal(yapildi.ozet, yapilmadi.ozet);
  });

  test("bütün zorunlu adımlar bitince kurulum tamam; davet yapılmamış olsa da", () => {
    const ilerleme = kurulumIlerlemesi(adimlar(false, 4));
    assert.equal(ilerleme.bitti, true);
    assert.equal(ilerleme.yuzde, 100);
    assert.equal(ilerleme.ozet, "4 zorunlu adımdan 4 tanesi tamamlandı");
  });

  test("CRM yokken (talep adımı eklenmez) üç zorunlu adım", () => {
    const ilerleme = kurulumIlerlemesi(adimlar(false, 1).filter((a) => a.key !== "talep"));
    assert.equal(ilerleme.toplam, 3);
    assert.equal(ilerleme.ozet, "3 zorunlu adımdan 1 tanesi tamamlandı");
  });
});

describe("ana ekran kartı ortak ilerlemeyi kullanıyor", () => {
  const kaynak = readFileSync("app/panel/page.tsx", "utf8");
  test("sayaç, çubuk ve liste aynı zorunlu listeden; isteğe bağlı ayrı bölümde", () => {
    assert.match(kaynak, /kurulumIlerlemesi\(setupSteps\)/);
    assert.match(kaynak, /ilerleme\.zorunlu\.map/);
    assert.match(kaynak, /ilerleme\.istegeBagli\.map/);
    assert.ok(!/setupSteps\.map/.test(kaynak), "bütün adımlar tek listede numaralanmamalı");
  });
});
