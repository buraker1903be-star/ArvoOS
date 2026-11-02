import assert from "node:assert/strict";
import test from "node:test";
import { gonderimDurumu, gonderimSirasi } from "@/lib/proforma-gonderim";

test("iki kanal da gittiyse gitti, biri gittiyse yarım, hiçbiri gitmediyse gitmedi", () => {
  assert.equal(gonderimDurumu({ gonderildi_at: "2026-11-02T10:00:00Z", bildirildi_at: "2026-11-02T10:00:00Z" }), "gitti");
  assert.equal(gonderimDurumu({ gonderildi_at: null, bildirildi_at: "2026-11-02T10:00:00Z" }), "eksik");
  assert.equal(gonderimDurumu({ gonderildi_at: "2026-11-02T10:00:00Z" }), "eksik");
  /* Hata metni tek başına "gitti" saydırmaz. */
  assert.equal(gonderimDurumu({ gonderim_hatasi: "RESEND_API_KEY yok" }), "gitmedi");
  assert.equal(gonderimDurumu({}), "gitmedi");
});

test("kuyruk: gitmeyen önce, eşitlikte sıra korunur", () => {
  const g = "2026-11-02T10:00:00Z";
  const sirali = gonderimSirasi([
    { id: "a", gonderildi_at: g, bildirildi_at: g },
    { id: "b" },
    { id: "c", bildirildi_at: g },
    { id: "d" },
  ]);
  assert.deepEqual(sirali.map((x) => x.id), ["b", "d", "c", "a"]);
});
