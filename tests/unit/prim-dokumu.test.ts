import assert from "node:assert/strict";
import test from "node:test";
import type { AccrualRow } from "../../lib/commission-accruals.ts";
import type { CommissionPayment } from "../../lib/commission-ledger.ts";
import { primDonemi } from "../../lib/prim-donemi.ts";
import { primDokumu, primSayfalari } from "../../lib/prim-dokumu.ts";

/*
  PRİM DÖKÜMÜ (lib/prim-dokumu): pencere, Excel ve PDF aynı dökümden.
  Sabitlenen: dönem süzgeci yürüyen bakiyeyi bozmuyor, Excel'deki rakamlar
  ekrandakilerle aynı, dağıtım okunamayınca iş sayfası üretilmiyor.
*/

const satir = (o: Partial<AccrualRow>): AccrualRow => ({
  id: "x", type: "Satış", employeeId: "gizem", customer: "Ayşe", reference: "SOZ-1", contractId: "s1",
  base: 0, rate: 10, amount: 0, date: "2026-10-01", status: "accrued", ...o,
});
const odeme = (o: Partial<CommissionPayment>): CommissionPayment => ({ id: "o1", employeeId: "gizem", amount: 0, paidOn: "2026-10-10", method: "havale", note: null, ...o });

const girdi = (dagitimAcik = true) => ({
  accruals: [
    satir({ id: "a", amount: 400000, date: "2026-09-15" }),
    satir({ id: "b", amount: 200000, date: "2026-10-05", reference: "SOZ-2", contractId: "s2", customer: "Can" }),
    satir({ id: "c", type: "Operasyon", amount: 50000, date: "2026-10-07T10:00:00Z" }),
    satir({ id: "d", employeeId: "erencan", amount: 999 }),
  ],
  payments: [odeme({ id: "o1", amount: 300000, paidOn: "2026-10-10" })],
  dagitimlar: [{ paymentId: "o1", contractId: "s1", amount: 300000 }],
  dagitimAcik,
  beklenenGirdisi: () => null,
});

test("dönem özeti yalnızca dönemi, bakiye tüm geçmişi sayar", () => {
  const d = primDokumu(girdi(), "gizem", primDonemi("bu-ay", "2026-10-20"));
  assert.deepEqual([d.ozet.satisToplam, d.ozet.operasyonToplam, d.ozet.hakEdis, d.ozet.donemOdemesi], [200000, 50000, 250000, 300000]);
  assert.deepEqual([d.toplam.accrued, d.toplam.paid, d.toplam.balance], [650000, 300000, 350000]);
  // Eylül hareketi dönem dışında ama en eski Ekim hareketinin bakiyesi onu içeriyor.
  assert.equal(d.hareketler.length, 3);
  assert.equal(d.hareketler.at(-1)?.balance, 600000);
});

test("Excel rakamları dökümle aynı; ödeme satırında dağılım yazıyor", () => {
  const d = primDokumu(girdi(), "gizem", null);
  const [ozet, hareket, is] = primSayfalari(d, "hepsi", "Gizem");
  const deger = (ad: string) => (ozet.satirlar.find((r) => r[0] === ad)?.[1] as { deger: number }).deger;
  assert.equal(deger("Ödenecek bakiye"), 3500);
  assert.equal(hareket.satirlar.length, d.hareketler.length);
  const odemeSatiri = hareket.satirlar.find((r) => r[1] === "Ödeme");
  assert.match(String(odemeSatiri?.[3]), /SOZ-1/);
  assert.deepEqual(is.satirlar.map((r) => r[0]), d.isler.map((i) => i.reference));
});

test("tek bölüm istenince yalnızca o sayfa; dağıtım okunamadıysa iş sayfası yok", () => {
  assert.deepEqual(primSayfalari(primDokumu(girdi(), "gizem", null), "hareket", "Gizem").map((s) => s.ad), ["Hareket dökümü"]);
  const kapali = primDokumu(girdi(false), "gizem", null);
  assert.deepEqual(kapali.isler, []);
  assert.deepEqual(primSayfalari(kapali, "is", "Gizem"), []);
});
