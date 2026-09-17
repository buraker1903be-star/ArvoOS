import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLabeledSchedule,
  calculatePaymentSchedule,
  carryDueDates,
  installmentLabel,
  normalizePaymentSchedule,
  scheduleDateIssue,
} from "@/lib/payment-schedule";

const sum = (items: { amount: number }[]) => items.reduce((total, item) => total + item.amount, 0);

test("plan tutarları kuruşuna kadar toplamı verir", () => {
  for (const total of [100_00, 1_000_01, 33_333, 7]) {
    for (const type of ["cash", "half", "third"] as const) {
      assert.equal(sum(calculatePaymentSchedule(total, type)), total, `${type} / ${total}`);
    }
  }
});

test("bölünemeyen kuruş baştaki taksitlere eklenir", () => {
  const schedule = calculatePaymentSchedule(100, "third");
  assert.deepEqual(schedule.map((item) => item.amount), [34, 33, 33]);
});

test("etiketler ve tetikleyiciler taksit sayısına göre", () => {
  assert.deepEqual(calculatePaymentSchedule(1000, "cash").map((i) => i.label), ["Peşin Ödeme"]);
  assert.deepEqual(calculatePaymentSchedule(1000, "half").map((i) => i.label), ["Ön Ödeme", "Son Ödeme"]);
  assert.deepEqual(
    calculatePaymentSchedule(1000, "third").map((i) => i.label),
    ["Ön Ödeme", "Ara Ödeme", "Son Ödeme"],
  );
  // Birden fazla ara ödeme numaralanır.
  assert.deepEqual(
    buildLabeledSchedule(400, [100, 100, 100, 100]).map((i) => i.label),
    ["Ön Ödeme", "1. Ara Ödeme", "2. Ara Ödeme", "Son Ödeme"],
  );
});

test("vade tarihi ya da koşulu olmayan taksit reddedilir", () => {
  // Gerileme: 3'lü planın "Ara Ödeme"si ikisi de olmadan kaydediliyor,
  // sözleşmenin ödeme tablosunda boş görünüyordu.
  const schedule = calculatePaymentSchedule(1000, "third");
  assert.match(String(scheduleDateIssue(schedule)), /Ara Ödeme/);

  const duzeltilmis = schedule.map((item) => (item.trigger ? item : { ...item, due_date: "2026-05-01" }));
  assert.equal(scheduleDateIssue(duzeltilmis), null);
});

test("geçersiz vade tarihi yakalanır", () => {
  const schedule = [{ sequence: 1, label: "Peşin", due_date: "2026-02-31", amount: 100, percentage: 100 }];
  assert.match(String(scheduleDateIssue(schedule)), /geçerli bir vade tarihi/);
  assert.match(String(scheduleDateIssue("plan değil")), /okunamadı/);
});

test("tutar değişince girilmiş vade tarihleri korunur", () => {
  const onceki = calculatePaymentSchedule(1000, "half").map((item) => ({ ...item, due_date: "2026-05-01" }));
  const yeni = calculatePaymentSchedule(2000, "half");
  assert.deepEqual(carryDueDates(yeni, onceki).map((i) => i.due_date), ["2026-05-01", "2026-05-01"]);
});

test("carryDueDates geçersiz girdide çökmez", () => {
  const yeni = calculatePaymentSchedule(1000, "half");
  assert.deepEqual(carryDueDates(yeni, null), yeni);
  assert.deepEqual(carryDueDates(yeni, [{ sequence: 1, due_date: "bozuk" }]).map((i) => i.due_date), ["", ""]);
});

test("eski TL kayıtları kuruşa yükseltilir", () => {
  const eski = [{ sequence: 1, label: "Peşin Ödeme", due_date: "", amount: 1500, percentage: 100 }];
  const duzeltilmis = normalizePaymentSchedule(eski, 150_000, "cash");
  assert.equal(sum(duzeltilmis), 150_000);
});

test("bozuk plan seçili plan türünden yeniden kurulur", () => {
  const bozuk = [{ sequence: 1, label: "x", due_date: "", amount: 7, percentage: 0 }];
  assert.equal(sum(normalizePaymentSchedule(bozuk, 100_000, "half")), 100_000);
});

test("özel planda etiketler korunur, tutarlar toplama zorlanır", () => {
  const ozel = [
    { sequence: 1, label: "Kapora", due_date: "2026-01-01", amount: 30, percentage: 30 },
    { sequence: 2, label: "Bakiye", due_date: "2026-02-01", amount: 70, percentage: 70 },
  ];
  const sonuc = normalizePaymentSchedule(ozel, 100_000, "custom");
  assert.equal(sum(sonuc), 100_000);
  assert.deepEqual(sonuc.map((i) => i.label), ["Kapora", "Bakiye"]);
  assert.deepEqual(sonuc.map((i) => i.amount), [30_000, 70_000]);
});

test("boş plan, tür verilmişse hesaplanır", () => {
  assert.equal(sum(normalizePaymentSchedule([], 100_000, "third")), 100_000);
  assert.deepEqual(normalizePaymentSchedule([], 100_000), []);
});

test("aşırı uzun eski etiket kısaltılır", () => {
  // Eski kayıtlarda tek satırlık planın adı bütün plan metni olabiliyordu.
  const uzun = "ÖN ÖDEME: 16.000 TL (Sözleşme Onayıyla) ARA ÖDEME: 8.000 TL SON ÖDEME: 8.000 TL";
  assert.equal(installmentLabel(uzun, 1), "1. Ödeme");
  assert.equal(installmentLabel("Ön Ödeme", 1), "Ön Ödeme");
  assert.equal(installmentLabel(null, 2), "2. Ödeme");
});

test("negatif tutar sıfıra çekilir", () => {
  assert.deepEqual(calculatePaymentSchedule(-500, "cash").map((i) => i.amount), [0]);
});
