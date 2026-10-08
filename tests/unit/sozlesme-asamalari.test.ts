import assert from "node:assert/strict";
import test from "node:test";
import { sozlesmeAdimi, type SozlesmeDurumu } from "@/lib/sozlesme-asamalari";

/* Sözleşme detayındaki aşama çizgisi. */

const s = (ek: Partial<SozlesmeDurumu>): SozlesmeDurumu => ({ status: "draft", view_count: 0, workflow_id: null, ...ek });

test("taslak, gönderildi, görüldü", () => {
  assert.equal(sozlesmeAdimi(s({})).adim, 0);
  assert.equal(sozlesmeAdimi(s({ status: "sent" })).adim, 1);
  assert.equal(sozlesmeAdimi(s({ status: "sent", view_count: 2 })).adim, 2);
});

test("imzalandı; iş akışı açıldıysa ya da tamamlandıysa son adım", () => {
  assert.equal(sozlesmeAdimi(s({ status: "signed" })).adim, 3);
  assert.equal(sozlesmeAdimi(s({ status: "signed", workflow_id: "w" })).adim, 4);
  assert.equal(sozlesmeAdimi(s({ status: "completed" })).adim, 4);
});

test("reddedilen ve iptal edilen çizgide yok, sebebi var", () => {
  assert.deepEqual(sozlesmeAdimi(s({ status: "rejected" })), { adim: null, kapanis: "Müşteri reddetti" });
  assert.deepEqual(sozlesmeAdimi(s({ status: "cancelled" })), { adim: null, kapanis: "İptal edildi" });
});
