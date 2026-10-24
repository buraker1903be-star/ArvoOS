import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { AYLAR, aralikYuklemi, ayinSonGunu, donemCoz, donemEtiketi, gecerliGun, gunAnahtari, gunYazisi } from "../../lib/rapor-donemi";

/*
  Dönem mantığı sekiz raporun ortak zemini: burada bir kayma, bütün
  raporların sayılarını birden kaydırır. Testler 12.10.2026'da
  düzeltilen iki hatayı sabitliyor (UTC gün kayması ve geçersiz özel
  aralığın sayfayı düşürmesi) ve dönemin uçlarının KAPALI aralık
  olduğunu.
*/
describe("rapor dönemi", () => {
  it("ayın son gününü artık yılda da doğru verir", () => {
    assert.equal(ayinSonGunu(2024, 2), "2024-02-29");
    assert.equal(ayinSonGunu(2026, 2), "2026-02-28");
    assert.equal(ayinSonGunu(2026, 12), "2026-12-31");
  });

  it("ay taşmasını önceki yıla döndürür", () => {
    // Ocak'ta "geçen ay" aralık; ay 0 geçerli bir giriş.
    assert.equal(ayinSonGunu(2026, 0), "2025-12-31");
  });

  it("geçersiz günü reddeder", () => {
    assert.equal(gecerliGun("2026-10-24"), true);
    assert.equal(gecerliGun("abc"), false);
    assert.equal(gecerliGun("2026-13-01"), false);
    assert.equal(gecerliGun(undefined), false);
    assert.equal(gecerliGun(""), false);
  });

  it("özel aralığı geçersizse bu aya döner", () => {
    // Önceden `Invalid Date` üretip sorgu penceresinde sayfayı düşürüyordu.
    const d = donemCoz("ozel", "abc", "2026-10-24");
    assert.equal(d.key, "bu_ay");
    assert.match(d.startKey, /^\d{4}-\d{2}-01$/);
  });

  it("ters girilen özel aralığı düzeltir", () => {
    const d = donemCoz("ozel", "2026-10-24", "2026-10-01");
    assert.deepEqual([d.startKey, d.endKey], ["2026-10-01", "2026-10-24"]);
    assert.equal(d.key, "ozel");
  });

  it("tanınmayan aralık adını bu aya çevirir", () => {
    assert.equal(donemCoz("__proto__").key, "bu_ay");
    assert.equal(donemCoz(undefined).key, "bu_ay");
    assert.equal(donemCoz("son_3_ay").key, "bu_ay");
  });

  it("bu yıl aralığı takvim yılının iki ucunu kapsar", () => {
    const d = donemCoz("bu_yil");
    assert.match(d.startKey, /^\d{4}-01-01$/);
    assert.equal(d.endKey, `${d.startKey.slice(0, 4)}-12-31`);
  });

  it("aralık yüklemi iki ucu da içine alır", () => {
    const yuklem = aralikYuklemi({ startKey: "2026-10-01", endKey: "2026-10-31", key: "ozel" });
    assert.equal(yuklem("2026-10-01"), true);
    assert.equal(yuklem("2026-10-31"), true);
    assert.equal(yuklem("2026-09-30"), false);
    assert.equal(yuklem("2026-11-01"), false);
    assert.equal(yuklem(null), false);
  });

  it("zaman damgasını Türkiye gününe çevirir", () => {
    /* UTC'de 21:00'den sonrası Türkiye'de ERTESİ gün. Eskiden
       `slice(0, 10)` ile UTC günü alınıyordu: ayın 1'inde 00:00–03:00
       arasında imzalanan sözleşme önceki aya düşüyordu. */
    assert.equal(gunAnahtari("2026-10-31T21:30:00Z"), "2026-11-01");
    assert.equal(gunAnahtari("2026-10-31T20:30:00Z"), "2026-10-31");
    // Yalın tarih olduğu gibi kalır (maliyet kalemi, cari hareketi).
    assert.equal(gunAnahtari("2026-10-01"), "2026-10-01");
  });

  it("aralık yüklemi gece yarısı damgasını doğru ayın içinde tutar", () => {
    const ekim = aralikYuklemi({ startKey: "2026-10-01", endKey: "2026-10-31", key: "bu_ay" });
    // Türkiye'de 1 Ekim 00:30 — UTC'de hâlâ 30 Eylül.
    assert.equal(ekim("2026-09-30T21:30:00Z"), true);
    // Türkiye'de 1 Kasım 00:30 — UTC'de hâlâ 31 Ekim.
    assert.equal(ekim("2026-10-31T21:30:00Z"), false);
  });

  it("gün yazısını Türkçe biçimde verir", () => {
    assert.equal(gunYazisi("2026-10-24"), "24.10.2026");
  });

  it("dönem etiketini seçime göre yazar", () => {
    assert.equal(donemEtiketi({ startKey: "", endKey: "", key: "bu_ay" }), "Bu ay");
    assert.equal(donemEtiketi({ startKey: "", endKey: "", key: "gecen_ay" }), "Geçen ay");
    assert.equal(donemEtiketi({ startKey: "", endKey: "", key: "bu_yil" }), "Bu yıl");
    assert.equal(
      donemEtiketi({ startKey: "2026-10-01", endKey: "2026-10-24", key: "ozel" }),
      "01.10.2026 – 24.10.2026",
    );
  });

  it("on iki ay kısaltması eksiksiz", () => {
    assert.equal(AYLAR.length, 12);
    assert.equal(AYLAR[0], "Oca");
    assert.equal(AYLAR[11], "Ara");
  });
});
