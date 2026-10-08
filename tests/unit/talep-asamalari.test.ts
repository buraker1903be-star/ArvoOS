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
