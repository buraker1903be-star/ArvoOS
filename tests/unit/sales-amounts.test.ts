import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_TYPES, TAX_STATUSES, rescaleSchedule, splitTax } from "@/lib/sales-amounts";

const toplam = (rows: { amount: number }[]) => rows.reduce((sum, row) => sum + row.amount, 0);

test("KDV hariç girilen tutara vergi eklenir", () => {
  assert.deepEqual(splitTax(100_00, "excluded"), { net: 100_00, tax: 20_00, gross: 120_00 });
});

test("KDV dahil girilen tutar içinden ayrıştırılır", () => {
  // crm_proposals.amount her zaman brüt tutarı tutar.
  assert.deepEqual(splitTax(120_00, "included"), { net: 100_00, tax: 20_00, gross: 120_00 });
});

test("istisna: vergi yok, üç değer de aynı", () => {
  assert.deepEqual(splitTax(100_00, "exempt"), { net: 100_00, tax: 0, gross: 100_00 });
  // Tanınmayan durum da istisna gibi ele alınır.
  assert.deepEqual(splitTax(100_00, "bilinmeyen"), { net: 100_00, tax: 0, gross: 100_00 });
});

test("net + vergi her zaman brüte eşittir", () => {
  for (const kurus of [1, 7, 33, 100_00, 1_234_56, 999_999_99]) {
    for (const durum of ["excluded", "included", "exempt"]) {
      const { net, tax, gross } = splitTax(kurus, durum);
      assert.equal(net + tax, gross, `${durum} / ${kurus}`);
    }
  }
});

test("dahil → hariç gidiş dönüşü en fazla 1 kuruş sapar", () => {
  // Uygulama bu gidiş dönüşü yapmaz: splitTax her zaman kullanıcının GİRDİĞİ
  // tutara, seçili KDV durumuyla uygulanır. Sınır yine de yazılı olsun —
  // ileride net üzerinden brüt hesaplayan bir yol eklenirse tamsayı
  // yuvarlaması 1 kuruş oynatabilir (ör. 333,33 TL dahil → geri dönüşte 333,34).
  for (const brut of [120_00, 100_01, 33_333]) {
    const { net } = splitTax(brut, "included");
    const fark = Math.abs(splitTax(net, "excluded").gross - brut);
    assert.ok(fark <= 1, `${brut}: ${fark} kuruş sapma`);
  }
});

test("sıfır ve negatif tutarda çökmez", () => {
  assert.deepEqual(splitTax(0, "included"), { net: 0, tax: 0, gross: 0 });
  const negatif = splitTax(-100_00, "excluded");
  assert.equal(negatif.net + negatif.tax, negatif.gross);
});

test("tutar değişince plan yeni toplama göre yeniden hesaplanır", () => {
  // Gerileme: tutar değiştiğinde müşteri belgesinde eski taksit tutarları kalıyordu.
  const eski = rescaleSchedule(null, 100_000, "half");
  assert.equal(toplam(eski), 100_000);
  const yeni = rescaleSchedule(eski, 250_000, "half");
  assert.equal(toplam(yeni), 250_000);
});

test("girilmiş vade tarihleri ölçeklemede korunur", () => {
  const plan = rescaleSchedule(null, 100_000, "half").map((row) => ({ ...row, due_date: "2026-05-01" }));
  const olcekli = rescaleSchedule(plan, 300_000, "half");
  assert.deepEqual(olcekli.map((row) => row.due_date), ["2026-05-01", "2026-05-01"]);
  assert.equal(toplam(olcekli), 300_000);
});

test("özel planda etiketler korunur, tutarlar ölçeklenir", () => {
  const ozel = [
    { sequence: 1, label: "Kapora", due_date: "2026-01-01", amount: 30_000, percentage: 30 },
    { sequence: 2, label: "Bakiye", due_date: "2026-02-01", amount: 70_000, percentage: 70 },
  ];
  const olcekli = rescaleSchedule(ozel, 200_000, "custom");
  assert.deepEqual(olcekli.map((row) => row.label), ["Kapora", "Bakiye"]);
  assert.deepEqual(olcekli.map((row) => row.amount), [60_000, 140_000]);
  assert.equal(toplam(olcekli), 200_000);
});

test("tanınmayan plan türü boş plana düşmez", () => {
  const sonuc = rescaleSchedule(null, 100_000, "olmayan-tur");
  assert.ok(sonuc.length > 0);
  assert.equal(toplam(sonuc), 100_000);
});

test("kabul edilen KDV durumları ve plan türleri", () => {
  assert.deepEqual([...TAX_STATUSES].sort(), ["excluded", "exempt", "included"]);
  assert.deepEqual([...PLAN_TYPES].sort(), ["cash", "custom", "half", "third"]);
});
