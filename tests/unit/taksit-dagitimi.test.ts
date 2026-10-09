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

test("kalan taksitler açık bakiyeyi aşmaz: fazla en geç vadeden düşer", async () => {
  /* 09.10.2026: 45.000 TL sözleşmenin planı 2 × 27.500 TL'ydi; 15.000 TL
     tahsilattan sonra 30.000 TL açık bakiyeye karşı 40.000 TL "vadesi
     geçti" görünüyordu. */
  const { bakiyeyeSigdir, taksitleriDagit } = await import("@/lib/taksit-dagitimi");
  const dagitilmis = taksitleriDagit([
    { id: "1", due_date: "2026-10-05", amount: 2750000, status: "pending" },
    { id: "2", due_date: "2026-10-05", amount: 2750000, status: "pending" },
  ], 1500000, "2026-10-09");
  const sigdirilmis = bakiyeyeSigdir(dagitilmis, 3000000);
  assert.equal(sigdirilmis.reduce((t, x) => t + x.kalan, 0), 3000000);
  assert.deepEqual(sigdirilmis.map((x) => x.kalan), [1250000, 1750000]);
  // Plan bakiyeyle uyumluysa dokunulmaz.
  assert.equal(bakiyeyeSigdir(dagitilmis, 4000000), dagitilmis);
  // Bakiye sıfırsa hepsi kapanır.
  assert.ok(bakiyeyeSigdir(dagitilmis, 0).every((x) => x.kalan === 0 && x.durum === "odendi"));
  // En geç vadeli önce düşer.
  const farkli = bakiyeyeSigdir(taksitleriDagit([
    { id: "a", due_date: "2026-09-01", amount: 1000, status: "pending" },
    { id: "b", due_date: "2026-12-01", amount: 1000, status: "pending" },
  ], 0, "2026-10-09"), 1200);
  assert.deepEqual(farkli.map((x) => [x.id, x.kalan]), [["a", 1000], ["b", 200]]);
});
