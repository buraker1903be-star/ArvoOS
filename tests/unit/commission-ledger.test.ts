// Prim cari hesabı: hak ediş eksi ödeme, yürüyen bakiye ve sıralama.
// Bakiye yanlışsa personele fazla ya da eksik ödeme yapılır; bu yüzden
// iade (negatif tahakkuk) ve aynı gün düşen hareketler ayrıca sınanıyor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { employeeLedger, ledgerTotals, type CommissionPayment } from "../../lib/commission-ledger";
import type { AccrualRow } from "../../lib/commission-accruals";

const tahakkuk = (d: Partial<AccrualRow> = {}): AccrualRow => ({
  id: "a1", type: "Satış", employeeId: "p1", customer: "Müşteri", reference: "SOZ-1",
  base: 100_000, rate: 10, amount: 10_000, date: "2026-09-01", status: "accrued", ...d,
});
const odeme = (d: Partial<CommissionPayment> = {}): CommissionPayment => ({
  id: "o1", employeeId: "p1", amount: 6_000, paidOn: "2026-09-10", method: "havale", note: null, ...d,
});

test("bakiye hak edişten ödemeyi düşer", () => {
  const t = ledgerTotals("p1", [tahakkuk(), tahakkuk({ id: "a2", amount: 5_000 })], [odeme()]);
  assert.deepEqual(t, { accrued: 15_000, paid: 6_000, balance: 9_000 });
});

test("iade bakiyeyi düşürür", () => {
  // Tahsilat iade edilince primi de geri alınır; negatif tahakkuk.
  const t = ledgerTotals("p1", [tahakkuk(), tahakkuk({ id: "a2", amount: -10_000 })], []);
  assert.deepEqual(t, { accrued: 0, paid: 0, balance: 0 });
});

test("başka personelin hareketi karışmaz", () => {
  const t = ledgerTotals("p1", [tahakkuk(), tahakkuk({ id: "a2", employeeId: "p2", amount: 99_000 })],
    [odeme(), odeme({ id: "o2", employeeId: "p2", amount: 50_000 })]);
  assert.deepEqual(t, { accrued: 10_000, paid: 6_000, balance: 4_000 });
});

test("hareketler eskiden yeniye, bakiye yürür", () => {
  const hareketler = employeeLedger("p1",
    [tahakkuk({ id: "a1", amount: 10_000, date: "2026-09-01" }), tahakkuk({ id: "a2", amount: 4_000, date: "2026-09-20" })],
    [odeme({ id: "o1", amount: 6_000, paidOn: "2026-09-10" })]);
  assert.deepEqual(hareketler.map((h) => [h.id, h.balance]), [["a1", 10_000], ["o1", 4_000], ["a2", 8_000]]);
});

test("aynı gün: önce tahakkuk sonra ödeme", () => {
  // Aynı gün hak edilip ödenen primde bakiye arada eksiye düşmemeli.
  const hareketler = employeeLedger("p1", [tahakkuk({ date: "2026-09-10", amount: 6_000 })], [odeme({ paidOn: "2026-09-10" })]);
  assert.deepEqual(hareketler.map((h) => [h.kind, h.balance]), [["accrual", 6_000], ["payment", 0]]);
});

test("operasyon priminin ISO damgası Türkiye gününe çevrilir", () => {
  // 31 Ağustos 21:30 UTC = 1 Eylül 00:30 (TR). Gün anahtarı eylül olmalı,
  // yoksa hareket bir önceki ayda görünür.
  const [hareket] = employeeLedger("p1", [tahakkuk({ type: "Operasyon", date: "2026-08-31T21:30:00Z" })], []);
  assert.equal(hareket.date, "2026-09-01");
});

test("ödeme yöntemi ve notu ayrıntıda görünür", () => {
  const [hareket] = employeeLedger("p1", [], [odeme({ method: "nakit", note: "Eylül primi" })]);
  assert.equal(hareket.detail, "Nakit · Eylül primi");
});
