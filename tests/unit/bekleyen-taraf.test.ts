import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  BEKLEYEN_TARAFLAR,
  beklemeGunu,
  beklemeOzeti,
  bekleyenTarafMi,
  hatirlatmaKarari,
} from "@/lib/bekleyen-taraf";

/*
  "Top kimde".

  Pano işin hangi aşamada olduğunu söylüyordu, kimin elinde olduğunu değil.
  Bu modülün sabitlediği iki şey: bekleme süresi İstanbul gününe göre
  ölçülüyor, ve top bizde değilken uyarı kişiye değil kuruma gidiyor.
*/
describe("bekleme süresi", () => {
  test("gün farkı İstanbul gününe göre", () => {
    assert.equal(beklemeGunu("2026-10-01T07:00:00Z", "2026-10-04"), 3);
    assert.equal(beklemeGunu("2026-10-04T07:00:00Z", "2026-10-04"), 0);
  });

  test("gece yarısından sonraki damga bir gün ileri sayılmıyor", () => {
    /*
      Sunucu UTC'de çalışıyor. 30 Eylül 22:30 UTC, İstanbul'da 1 Ekim
      01:30'dur; UTC gününe bakılsaydı bekleme bir gün fazla görünürdü.
    */
    assert.equal(beklemeGunu("2026-09-30T22:30:00Z", "2026-10-01"), 0);
  });

  test("damga yoksa ölçülemiyor, geleceğe dönük damga negatif vermiyor", () => {
    assert.equal(beklemeGunu(null, "2026-10-04"), null);
    assert.equal(beklemeGunu("bozuk", "2026-10-04"), null);
    assert.equal(beklemeGunu("2026-10-10T07:00:00Z", "2026-10-04"), 0);
  });

  test("özet cümlesi okunur", () => {
    assert.equal(beklemeOzeti("customer", "2026-10-01T07:00:00Z", "2026-10-04"), "3 gündür müşteride");
    assert.equal(beklemeOzeti("us", "2026-10-04T07:00:00Z", "2026-10-04"), "Bugünden beri bizde");
    assert.equal(beklemeOzeti("third_party", null, "2026-10-04"), "Üçüncü tarafta");
  });

  test("tanınmayan değer taraf sayılmıyor", () => {
    assert.equal(bekleyenTarafMi("danisman"), false);
    assert.equal(BEKLEYEN_TARAFLAR.every(bekleyenTarafMi), true);
  });
});

describe("hatırlatma kime gidiyor", () => {
  const girdi = {
    durum: "overdue" as const,
    adimBasligi: "Veri Toplama",
    gecikmeMetni: "“Veri Toplama” adımının teslimi 4 gün gecikti.",
    not: null,
    bekleyenGun: 3,
  };

  test("top bizdeyse uyarı kişiye gider, metin değişmez", () => {
    const karar = hatirlatmaKarari({ ...girdi, taraf: "us" });
    assert.equal(karar.kisiye, true);
    assert.equal(karar.category, "operation_step_due");
    assert.equal(karar.message, girdi.gecikmeMetni);
  });

  test("müşteride bekleyen adım için uzman dürtülmüyor", () => {
    /*
      Uzmanın yapabileceği bir şey yok ve her gecikme ona yazılıyormuş gibi
      görünür. Uyarı kuruma gidiyor: müşteriyi arayacak olan görsün.
    */
    const karar = hatirlatmaKarari({ ...girdi, taraf: "customer", not: "ham veri dosyası" });
    assert.equal(karar.kisiye, false);
    assert.equal(karar.category, "operation_waiting_party");
    assert.match(karar.title, /Müşteride/);
    assert.match(karar.message, /3 gündür/);
    assert.match(karar.message, /ham veri dosyası/);
  });

  test("üçüncü taraf ayrı başlıkla bildiriliyor", () => {
    const karar = hatirlatmaKarari({ ...girdi, taraf: "third_party" });
    assert.equal(karar.kisiye, false);
    assert.match(karar.title, /Üçüncü tarafta/);
    // Not yoksa cümle "Beklenen:" ile yarım kalmamalı.
    assert.equal(karar.message.includes("Beklenen:"), false);
  });

  test("süre bilinmiyorsa parantez basılmıyor", () => {
    const karar = hatirlatmaKarari({ ...girdi, taraf: "customer", bekleyenGun: null });
    assert.equal(/\(\s*\)/.test(karar.message), false);
    assert.match(karar.message, /müşteride bekliyor\./);
  });
});
