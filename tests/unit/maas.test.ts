import assert from "node:assert/strict";
import test from "node:test";
import { ayinIzinleri, ayinSonu, eksikGun, hakedisNeti, kadroluMu, odenecekTutar } from "@/lib/maas";

test("ödenecek: müşavir neti varsa o, yoksa anlaşılan; ek ödeme eklenir, avans ve kesinti düşer", () => {
  const s = { anlasilan_net: 3000000, resmi_net: null, ek_odeme: 0, avans: 0, kesinti: 0 };
  assert.deepEqual(odenecekTutar(s), { tutar: 3000000, eksi: false });
  assert.deepEqual(odenecekTutar({ ...s, resmi_net: 3100000, ek_odeme: 50000, avans: 100000, kesinti: 25000 }), { tutar: 3025000, eksi: false });
  assert.deepEqual(odenecekTutar({ ...s, anlasilan_net: null }), { tutar: null, eksi: false }, "maaşı girilmemiş kişi ödenmiş gibi görünmez");
  assert.deepEqual(odenecekTutar({ ...s, avans: 4000000 }), { tutar: 0, eksi: true }, "avans maaşı aşarsa sıfır ve uyarı");
});

test("izin günleri ay sınırında kesilir, yalnızca onaylılar, türe göre takvim günü", () => {
  const izinler = [
    { leave_type: "unpaid", start_date: "2026-10-29", end_date: "2026-11-03", status: "approved" },
    { leave_type: "sick", start_date: "2026-11-10", end_date: "2026-11-11", status: "approved" },
    { leave_type: "annual", start_date: "2026-11-20", end_date: "2026-11-21", status: "pending" },
    { leave_type: "annual", start_date: "2026-11-28", end_date: "2026-12-05", status: "approved" },
  ];
  const k = ayinIzinleri(izinler, "2026-11-01");
  assert.deepEqual(k, { unpaid: 3, sick: 2, annual: 3 });
  assert.equal(eksikGun(k), 5);
  assert.equal(ayinSonu("2026-02-01"), "2026-02-28");
  assert.equal(ayinSonu("2028-02-01"), "2028-02-29");
});

test("hakediş neti ve kadrolu ayrımı", () => {
  assert.equal(hakedisNeti({ tutar: 1000000, stopaj: 200000 }), 800000);
  assert.ok(kadroluMu("full_time") && kadroluMu("intern") && !kadroluMu("contractor"));
});
