import assert from "node:assert/strict";
import test from "node:test";
import { gecerliGun, gunFarki, gunKaydir, yeniVadeler } from "@/lib/taksit-vadesi";

const plan = [
  { id: "a", installment_no: 1, due_date: "2026-10-05", status: "pending" },
  { id: "b", installment_no: 2, due_date: "2026-11-05", status: "pending" },
  { id: "c", installment_no: 3, due_date: "2026-12-05", status: "cancelled" },
  { id: "d", installment_no: 4, due_date: null, status: "pending" },
];

test("gün anahtarı doğrulanıyor ve kaydırılıyor (ay/yıl taşması dahil)", () => {
  assert.equal(gecerliGun("2026-10-31"), true);
  assert.equal(gecerliGun("2026-02-30"), false);
  assert.equal(gecerliGun("05.10.2026"), false);
  assert.equal(gunFarki("2026-10-05", "2026-10-31"), 26);
  assert.equal(gunKaydir("2026-12-20", 15), "2027-01-04");
  // Yaz saati geçişi gün farkını bozmuyor (UTC öğlen üzerinden).
  assert.equal(gunFarki("2026-03-28", "2026-03-30"), 2);
});

test("yalnızca seçilen taksitin vadesi değişir", () => {
  assert.deepEqual(yeniVadeler(plan, "a", "2026-10-31", false), [{ id: "a", due_date: "2026-10-31" }]);
});

test("sonrakiler aynı gün kadar kayar; iptal ve vadesiz taksite dokunulmaz", () => {
  assert.deepEqual(yeniVadeler(plan, "a", "2026-10-31", true), [
    { id: "a", due_date: "2026-10-31" },
    { id: "b", due_date: "2026-12-01" },
  ]);
  // Öncekiler kaymaz.
  assert.deepEqual(yeniVadeler(plan, "b", "2026-11-20", true), [{ id: "b", due_date: "2026-11-20" }]);
});

test("geçersiz tarih ya da bilinmeyen taksit hiçbir şey değiştirmez", () => {
  assert.deepEqual(yeniVadeler(plan, "a", "2026-13-01", true), []);
  assert.deepEqual(yeniVadeler(plan, "x", "2026-10-31", true), []);
});
