import assert from "node:assert/strict";
import test from "node:test";
import { TALEP_ADIMLARI, talepAdimi } from "@/lib/talep-asamalari";

/* Talep detayındaki aşama çizgisi: genel ve akademik kurum kodları aynı beş adıma. */

test("beş adım", () => {
  assert.deepEqual([...TALEP_ADIMLARI], ["Yeni", "İnceleme", "Teklif", "Sözleşme", "İş"]);
});

test("genel kurum aşamaları", () => {
  assert.deepEqual(["lead", "qualified", "proposal", "contract", "won"].map(talepAdimi), [0, 1, 2, 3, 4]);
});

test("akademik kurum aşamaları aynı adımlara düşer", () => {
  assert.equal(talepAdimi("academic_review"), 1);
  assert.equal(talepAdimi("proposal_approved"), 2);
  assert.equal(talepAdimi("payment_pending"), 3);
  assert.equal(talepAdimi("expert_assigned"), 4);
});

test("arşivlenmiş ya da bilinmeyen aşama çizgide yok", () => {
  assert.equal(talepAdimi("lost"), null);
  assert.equal(talepAdimi("tanimsiz"), null);
});

test("çizgi bağlı kayıtlarla ilerler, geri gitmez", async () => {
  const { talepAdimiZincirle } = await import("@/lib/talep-asamalari");
  // Teklif aşamasında kalmış ama sözleşmesi imzalı ve işi açık talep: İş.
  assert.equal(talepAdimiZincirle("proposal", { sozlesmeVar: true, isVar: true }), 4);
  // Yalnızca sözleşme: Sözleşme.
  assert.equal(talepAdimiZincirle("proposal", { sozlesmeVar: true, isVar: false }), 3);
  // Zincir yoksa kendi aşaması.
  assert.equal(talepAdimiZincirle("qualified", { sozlesmeVar: false, isVar: false }), 1);
  // Kendi aşaması ilerideyse geri gitmez.
  assert.equal(talepAdimiZincirle("won", { sozlesmeVar: false, isVar: false }), 4);
  // Arşivlenmiş talep arşivde kalır.
  assert.equal(talepAdimiZincirle("lost", { sozlesmeVar: true, isVar: true }), null);
});
