import assert from "node:assert/strict";
import test from "node:test";
import { taksitleriDagit } from "@/lib/taksit-dagitimi";

/* Cari tahsilatının taksitlere dağıtılması. */

const t = (id: string, due_date: string | null, amount: number, status = "pending") => ({ id, due_date, amount, status });
const bugun = "2026-10-08";

test("kısmi ödenmiş ve vadesi geçmiş taksit: kalan tutar gecikmiş", () => {
  // Canlıdaki durum: 47.000 TL tek taksit, 31.500 TL tahsil edilmiş
  const [taksit] = taksitleriDagit([t("a", "2026-08-07", 4_700_000)], 3_150_000, bugun);
  assert.equal(taksit.odenen, 3_150_000);
  assert.equal(taksit.kalan, 1_550_000);
  assert.equal(taksit.durum, "gecikti");
});

test("en eski vadeden başlar; kalan sonrakine geçer", () => {
  const sonuc = taksitleriDagit([t("b", "2026-12-30", 1000), t("a", "2026-09-18", 1000), t("c", "2027-03-30", 1000)], 1500, bugun);
  assert.deepEqual(sonuc.map((x) => [x.id, x.durum, x.odenen]), [["a", "odendi", 1000], ["b", "kismi", 500], ["c", "bekliyor", 0]]);
});

test("iptal edilen taksit dağıtıma girmez; vadesiz en sonda", () => {
  const sonuc = taksitleriDagit([t("v", null, 500), t("x", "2026-09-01", 1000, "cancelled"), t("a", "2026-09-10", 500)], 600, bugun);
  assert.deepEqual(sonuc.map((x) => [x.id, x.durum, x.odenen]), [["x", "iptal", 0], ["a", "odendi", 500], ["v", "kismi", 100]]);
});

test("tahsilat yoksa vadesi geçen gecikti, gelecek bekliyor", () => {
  const sonuc = taksitleriDagit([t("a", "2026-10-01", 100), t("b", "2026-11-01", 100)], 0, bugun);
  assert.deepEqual(sonuc.map((x) => x.durum), ["gecikti", "bekliyor"]);
});

test("net tahsilat: tahsilat eksi iade; sözleşme borcu ve ek hizmet sayılmaz", async () => {
  const { netTahsilat } = await import("@/lib/taksit-dagitimi");
  assert.equal(netTahsilat([
    { entry_type: "credit", source_type: "manual", amount: 1000 },
    { entry_type: "credit", source_type: "paytr", amount: 500 },
    { entry_type: "debit", source_type: "adjustment", amount: 200 },
    { entry_type: "debit", source_type: "contract", amount: 9999 },
    { entry_type: "debit", source_type: "manual", amount: 300 },
  ]), 1300);
  assert.equal(netTahsilat([{ entry_type: "debit", source_type: "adjustment", amount: 50 }]), 0);
});

test("kurumun vadesi geçenleri: cari tahsilatı düşülür, carisiz taksit kendi durumuyla", async () => {
  const { vadesiGecenler } = await import("@/lib/taksit-dagitimi");
  const sonuc = vadesiGecenler({
    cariler: [{ id: "c1", entries: [{ entry_type: "credit", source_type: "manual", amount: 3_150_000 }] }],
    sozlesmeler: [{ party_id: "c1", payment_plan_id: "p1" }, { party_id: null, payment_plan_id: "p2" }],
    taksitler: [
      { id: "a", payment_plan_id: "p1", due_date: "2026-08-07", amount: 4_700_000, status: "pending" },
      { id: "b", payment_plan_id: "p2", due_date: "2026-09-01", amount: 100_000, status: "pending" },
      { id: "c", payment_plan_id: "p2", due_date: "2026-09-02", amount: 100_000, status: "paid" },
    ],
    bugun: "2026-10-08",
  });
  assert.deepEqual(sonuc, { adet: 2, tutar: 1_550_000 + 100_000 });
});
