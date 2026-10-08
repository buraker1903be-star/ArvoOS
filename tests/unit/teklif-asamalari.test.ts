import assert from "node:assert/strict";
import test from "node:test";
import { teklifAdimi, type TeklifDurumu } from "@/lib/teklif-asamalari";

/* Teklif detayındaki aşama çizgisi. */

const t = (ek: Partial<TeklifDurumu>): TeklifDurumu => ({ status: "draft", view_count: 0, archive_reason: null, superseded_by: null, sozlesmeVar: false, ...ek });

test("taslak, gönderildi, görüldü", () => {
  assert.deepEqual(teklifAdimi(t({})), { adim: 0, kapanis: null });
  assert.equal(teklifAdimi(t({ status: "sent" })).adim, 1);
  assert.equal(teklifAdimi(t({ status: "sent", view_count: 3 })).adim, 2);
});

test("kabul: durumdan ya da arşiv sebebinden; sözleşmesi varsa son adım", () => {
  assert.equal(teklifAdimi(t({ status: "accepted" })).adim, 3);
  assert.equal(teklifAdimi(t({ status: "archived", archive_reason: "accepted" })).adim, 3);
  assert.equal(teklifAdimi(t({ status: "archived", archive_reason: "accepted", sozlesmeVar: true })).adim, 4);
  // Hızlı yol: teklif "sent" iken doğrudan sözleşmeye dönüştürülmüş
  assert.equal(teklifAdimi(t({ status: "sent", sozlesmeVar: true })).adim, 4);
});

test("kapanan teklif çizgide yok, sebebi var", () => {
  assert.deepEqual(teklifAdimi(t({ status: "rejected" })), { adim: null, kapanis: "Müşteri reddetti" });
  assert.equal(teklifAdimi(t({ status: "archived", archive_reason: "rejected" })).kapanis, "Müşteri reddetti");
  assert.equal(teklifAdimi(t({ status: "expired" })).kapanis, "Süresi doldu");
  assert.equal(teklifAdimi(t({ status: "sent", superseded_by: "x" })).kapanis, "Yeni revizyonla değiştirildi");
  assert.equal(teklifAdimi(t({ status: "archived" })).kapanis, "Arşivlendi");
});
