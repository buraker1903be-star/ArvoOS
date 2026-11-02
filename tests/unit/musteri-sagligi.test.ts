import assert from "node:assert/strict";
import test from "node:test";
import { musteriSagligi, type SaglikGirdisi } from "@/lib/musteri-sagligi";

/* Müşteri sağlığı (lib/musteri-sagligi.ts, 02.11.2026). */
const temel: SaglikGirdisi = { etkinlik: "aktif", odemeGecikmis: false, yanitBekleyenDestek: 0, gecikenDestek: 0, yenilemeGun: 60 };

test("her şey yolundaysa iyi, neden yok", () => {
  assert.deepEqual(musteriSagligi(temel), { seviye: "iyi", nedenler: [] });
  // Etkinlik ölçülemiyorsa (ArvoOS'suz kurum) yalnızca bu yüzden düşmez.
  assert.equal(musteriSagligi({ ...temel, etkinlik: null }).seviye, "iyi");
});

test("riskli: ödeme gecikti, yenileme yakın ve sessiz, ya da geciken destek", () => {
  assert.deepEqual(musteriSagligi({ ...temel, odemeGecikmis: true }), { seviye: "riskli", nedenler: ["ödeme gecikti"] });
  assert.equal(musteriSagligi({ ...temel, etkinlik: "sessiz", yenilemeGun: 20 }).seviye, "riskli");
  assert.equal(musteriSagligi({ ...temel, gecikenDestek: 1, yanitBekleyenDestek: 1 }).seviye, "riskli");
});

test("izlenmeli: kullanım azaldı, sessiz ama yenileme uzak, yanıt bekleyen destek, yenileme bu hafta", () => {
  assert.deepEqual(musteriSagligi({ ...temel, etkinlik: "azaliyor" }), { seviye: "izlenmeli", nedenler: ["kullanım azaldı"] });
  assert.deepEqual(musteriSagligi({ ...temel, etkinlik: "sessiz" }).nedenler, ["panel kullanılmıyor"]);
  assert.deepEqual(musteriSagligi({ ...temel, yanitBekleyenDestek: 2 }).nedenler, ["2 destek talebi yanıt bekliyor"]);
  assert.deepEqual(musteriSagligi({ ...temel, yenilemeGun: 3 }).nedenler, ["yenilemeye 3 gün"]);
});

test("riskliyken izleme nedenleri de yazılır", () => {
  const s = musteriSagligi({ ...temel, odemeGecikmis: true, etkinlik: "azaliyor" });
  assert.deepEqual(s, { seviye: "riskli", nedenler: ["ödeme gecikti", "kullanım azaldı"] });
});
