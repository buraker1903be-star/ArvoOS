import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { aySecenekleri, ayEtiketi, donemAylari, gerceklesme, hedefHaritasi, type HedefKaydi } from "../../lib/personel-hedefi";
import type { Donem } from "../../lib/rapor-donemi";

const EKIM: Donem = { startKey: "2026-10-01", endKey: "2026-10-31", key: "bu_ay" };
const YIL: Donem = { startKey: "2026-01-01", endKey: "2026-12-31", key: "bu_yil" };
const OZEL: Donem = { startKey: "2026-10-05", endKey: "2026-10-20", key: "ozel" };

describe("dönemin ayları", () => {
  it("tek ayı kapsayan dönem o ayı veriyor", () => {
    assert.deepEqual(donemAylari(EKIM, "2026-10-24")?.aylar, ["2026-10-01"]);
  });

  it("yıl dönemi on iki ay veriyor ve yıl devri doğru", () => {
    const kapsam = donemAylari(YIL, "2026-10-24");
    assert.equal(kapsam?.aylar.length, 12);
    assert.equal(kapsam?.aylar[0], "2026-01-01");
    assert.equal(kapsam?.aylar[11], "2026-12-01");
  });

  it("yıl sınırını aşan dönem devrediyor", () => {
    const kapsam = donemAylari({ startKey: "2026-11-01", endKey: "2027-01-31", key: "ozel" }, "2026-11-10");
    assert.deepEqual(kapsam?.aylar, ["2026-11-01", "2026-12-01", "2027-01-01"]);
  });

  /*
    EN ÖNEMLİ KURAL. Yarım ay orantılanmıyor: aylık hedefi 16 güne
    bölüp "hedefin %48'i" yazmak, kimsenin koymadığı bir günlük
    hedefe dayanırdı.
  */
  it("tam aya oturmayan özel aralıkta hedef hesaplanmıyor", () => {
    assert.equal(donemAylari(OZEL, "2026-10-24"), null);
  });

  it("ayın ortasında biten dönem de reddediliyor", () => {
    assert.equal(donemAylari({ startKey: "2026-10-01", endKey: "2026-10-20", key: "ozel" }, "2026-10-24"), null);
  });

  it("şubatın son günü 28/29 olarak tanınıyor", () => {
    assert.deepEqual(donemAylari({ startKey: "2026-02-01", endKey: "2026-02-28", key: "ozel" }, "2026-03-01")?.aylar, ["2026-02-01"]);
    assert.deepEqual(donemAylari({ startKey: "2028-02-01", endKey: "2028-02-29", key: "ozel" }, "2028-03-01")?.aylar, ["2028-02-01"]);
  });

  it("süren ay işaretleniyor, dolmuş ay işaretlenmiyor", () => {
    assert.equal(donemAylari(EKIM, "2026-10-24")?.surenAy, true);
    assert.equal(donemAylari(EKIM, "2026-10-31")?.surenAy, false);
    assert.equal(donemAylari(EKIM, "2026-11-02")?.surenAy, false);
  });
});

describe("hedef haritası", () => {
  const hedefler: HedefKaydi[] = [
    { employee_id: "a", donem: "2026-10-01", tutar: 50_000_00 },
    { employee_id: "a", donem: "2026-11-01", tutar: 60_000_00 },
    { employee_id: "b", donem: "2026-10-01", tutar: 30_000_00 },
  ];

  it("yalnızca dönemin aylarını topluyor", () => {
    const harita = hedefHaritasi(hedefler, { aylar: ["2026-10-01"], surenAy: false });
    assert.equal(harita.get("a"), 50_000_00);
    assert.equal(harita.get("b"), 30_000_00);
  });

  it("çok aylı dönemde kişi başına topluyor", () => {
    const harita = hedefHaritasi(hedefler, { aylar: ["2026-10-01", "2026-11-01"], surenAy: false });
    assert.equal(harita.get("a"), 110_000_00);
  });

  /* Hedefi konmamış kişi haritada HİÇ yok: sıfır yazmak "hedefi
     sıfır" demekti ve ekranda %0 gerçekleşme olarak görünürdü. */
  it("hedefi olmayan kişi haritada yok", () => {
    const harita = hedefHaritasi(hedefler, { aylar: ["2026-10-01"], surenAy: false });
    assert.equal(harita.has("c"), false);
  });

  it("dönem dışı ay toplama girmiyor", () => {
    const harita = hedefHaritasi(hedefler, { aylar: ["2026-11-01"], surenAy: false });
    assert.equal(harita.get("a"), 60_000_00);
    assert.equal(harita.has("b"), false);
  });
});

describe("gerçekleşme", () => {
  it("yüzdeyi bir ondalıkla veriyor", () => {
    assert.equal(gerceklesme(50_000_00, 100_000_00), 50);
    assert.equal(gerceklesme(33_333_00, 100_000_00), 33.3);
  });

  it("hedefi aşan gerçekleşme yüzde 100'ü geçiyor", () => {
    assert.equal(gerceklesme(150_000_00, 100_000_00), 150);
  });

  /* Sıfır hedefte oran Infinity veriyordu; ekranda "%∞" yazıyordu. */
  it("hedef yok ya da sıfırsa oran yok", () => {
    assert.equal(gerceklesme(10_000_00, 0), null);
    assert.equal(gerceklesme(10_000_00, null), null);
    assert.equal(gerceklesme(10_000_00, undefined), null);
  });
});

describe("ay listesi ve etiket", () => {
  it("seçenekler geçmiş ve geleceği kapsıyor", () => {
    const liste = aySecenekleri("2026-10-24", 2, 2);
    assert.deepEqual(liste, ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01"]);
  });

  it("yıl devri hem geriye hem ileriye doğru", () => {
    assert.deepEqual(aySecenekleri("2026-01-15", 1, 0), ["2025-12-01", "2026-01-01"]);
    assert.deepEqual(aySecenekleri("2026-12-15", 0, 1), ["2026-12-01", "2027-01-01"]);
  });

  it("etiket Türkçe ay adıyla", () => {
    assert.equal(ayEtiketi("2026-11-01"), "Kasım 2026");
    assert.equal(ayEtiketi("2027-01-01"), "Ocak 2027");
  });
});
