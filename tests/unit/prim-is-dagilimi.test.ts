import assert from "node:assert/strict";
import test from "node:test";
import type { AccrualRow } from "../../lib/commission-accruals.ts";
import type { CommissionPayment } from "../../lib/commission-ledger.ts";
import { baglanmamisKisim, dagitimDenetle, dagitimOku, isPrimleri } from "../../lib/prim-is-dagilimi.ts";

/*
  PRİM ÖDEMESİNİN İŞLERE DAĞILIMI (lib/prim-is-dagilimi). Ödeme işlere
  isteğe bağlı ve kısmen dağıtılıyor; iş başına açık prim buradan.
*/

const satir = (o: Partial<AccrualRow>): AccrualRow => ({
  id: "x", type: "Satış", employeeId: "gizem", customer: "Ayşe", reference: "SOZ-1", contractId: "s1",
  base: 0, rate: 10, amount: 0, date: "2026-10-01", status: "accrued", ...o,
});
const odeme = (o: Partial<CommissionPayment>): CommissionPayment => ({ id: "o1", employeeId: "gizem", amount: 0, paidOn: "2026-10-10", method: "havale", note: null, ...o });

test("iş başına prim: satış + operasyon, iade düşülüyor, dağıtılan ödeniyor", () => {
  const accruals = [
    satir({ id: "a", amount: 314000, reference: "SOZ-1" }),
    satir({ id: "b", amount: -14000, reference: "SOZ-1 · iade" }),
    satir({ id: "c", type: "Operasyon", amount: 470000, date: "2026-10-07T10:00:00Z" }),
    satir({ id: "d", amount: 50000, reference: "SOZ-2", contractId: "s2", customer: "Can" }),
    // Başka personel ve sözleşmesiz satır dahil edilmiyor.
    satir({ id: "e", employeeId: "erencan", amount: 999 }),
    satir({ id: "f", type: "Operasyon", contractId: null, amount: 777 }),
  ];
  const payments = [odeme({ id: "o1", amount: 400000 }), odeme({ id: "o2", employeeId: "erencan", amount: 100 })];
  const dagitim = [
    { paymentId: "o1", contractId: "s1", amount: 300000 },
    { paymentId: "o2", contractId: "s1", amount: 100 }, // başka personelin ödemesi sayılmaz
  ];
  const isler = isPrimleri("gizem", accruals, payments, dagitim);
  assert.deepEqual(isler.map((i) => [i.reference, i.satis, i.operasyon, i.hakEdilen, i.odenen, i.acik]), [
    ["SOZ-1", 300000, 470000, 770000, 300000, 470000],
    ["SOZ-2", 50000, 0, 50000, 0, 50000],
  ]);
  assert.equal(isler[0].sonTarih, "2026-10-07");
});

test("bağlanmamış kısım: dağıtılmayan ve silinmiş işe dağıtılan", () => {
  const o = odeme({ id: "o1", amount: 500000 });
  assert.equal(baglanmamisKisim(o, []), 500000);
  assert.equal(baglanmamisKisim(o, [{ paymentId: "o1", contractId: "s1", amount: 314000 }, { paymentId: "o1", contractId: null, amount: 50000 }]), 186000);
});

test("dağıtım denetimi: ödemeyi aşamaz, başka personelin işi olmaz, tekrar ve sıfır yok", () => {
  const izinli = new Set(["s1", "s2"]);
  assert.equal(dagitimDenetle(500000, [{ contractId: "s1", amount: 314000 }, { contractId: "s2", amount: 50000 }], izinli), null);
  assert.equal(dagitimDenetle(500000, [], izinli), null);
  assert.match(dagitimDenetle(300000, [{ contractId: "s1", amount: 314000 }], izinli) ?? "", /büyük olamaz/);
  assert.match(dagitimDenetle(500000, [{ contractId: "s9", amount: 1 }], izinli) ?? "", /bu personelin/);
  assert.match(dagitimDenetle(500000, [{ contractId: "s1", amount: 1 }, { contractId: "s1", amount: 1 }], izinli) ?? "", /iki kez/);
  assert.match(dagitimDenetle(500000, [{ contractId: "s1", amount: 0 }], izinli) ?? "", /sıfırdan büyük/);
  assert.match(dagitimDenetle(500000, [{ contractId: "s1", amount: 1.5 }], izinli) ?? "", /sıfırdan büyük/);
});

test("formdan gelen dağıtım: boş = dağıtımsız, bozuk = hata (sessizce dağıtımsız kaydetmesin)", () => {
  assert.deepEqual(dagitimOku(""), []);
  assert.deepEqual(dagitimOku(`[{"contract_id":"s1","amount":314000}]`), [{ contractId: "s1", amount: 314000 }]);
  assert.ok("hata" in (dagitimOku("{bozuk") as object));
  assert.ok("hata" in (dagitimOku(`{"contract_id":"s1"}`) as object));
});
