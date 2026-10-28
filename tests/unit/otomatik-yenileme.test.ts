import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { AZAMI_DENEME, yenilemeBildirimi, yenilemeKarari, type YenilemeDurumu } from "@/lib/otomatik-yenileme";

/* Otomatik yenileme takvimi: hatırlatmadan önce çekim yok, günde bir deneme, üç denemede dur. */

// Dönem sonu 31 Ekim 2026, Türkiye günü (UTC 20:59 → TR 23:59).
const SON = "2026-10-31T20:59:00Z";
const D: YenilemeDurumu = { donemSonu: SON, bugun: "2026-10-28", denemeSayisi: 0, sonDenemeGunu: null, hatirlatilanDonem: null, kartSuresiGecti: false, bekleyenCekim: false };

describe("otomatik yenileme kararı", () => {
  test("3 gün kala hatırlatma, bir kez", () => {
    assert.deepEqual(yenilemeKarari(D), { tur: "hatirlat", donem: "2026-10-31" });
    assert.deepEqual(yenilemeKarari({ ...D, hatirlatilanDonem: "2026-10-31" }), { tur: "bekle" });
    assert.deepEqual(yenilemeKarari({ ...D, bugun: "2026-10-20" }), { tur: "bekle" });
  });

  test("dönem sonu günü çekim; hatırlatma gitmediyse önce hatırlatma", () => {
    assert.deepEqual(yenilemeKarari({ ...D, bugun: "2026-10-31", hatirlatilanDonem: "2026-10-31" }), { tur: "cek", donem: "2026-10-31" });
    assert.deepEqual(yenilemeKarari({ ...D, bugun: "2026-10-31" }), { tur: "hatirlat", donem: "2026-10-31" });
  });

  test("Türkiye günü: UTC 21:00 sonrası ertesi gündür", () => {
    // UTC 31 Ekim 22:00 = TR 1 Kasım 01:00: dönem sonu 1 Kasım sayılır, 31 Ekim'de henüz çekim yok.
    const r = yenilemeKarari({ ...D, donemSonu: "2026-10-31T22:00:00Z", bugun: "2026-10-31", hatirlatilanDonem: "2026-11-01" });
    assert.deepEqual(r, { tur: "bekle" });
  });

  test("günde bir deneme, üç denemede dur, bekleyen çekim varken dokunma", () => {
    const g = { ...D, bugun: "2026-11-01", hatirlatilanDonem: "2026-10-31" };
    assert.deepEqual(yenilemeKarari({ ...g, denemeSayisi: 1, sonDenemeGunu: "2026-11-01" }), { tur: "bekle" });
    assert.deepEqual(yenilemeKarari({ ...g, denemeSayisi: 1, sonDenemeGunu: "2026-10-31" }), { tur: "cek", donem: "2026-10-31" });
    assert.deepEqual(yenilemeKarari({ ...g, denemeSayisi: AZAMI_DENEME }), { tur: "durdur", neden: "deneme-bitti" });
    assert.deepEqual(yenilemeKarari({ ...g, bekleyenCekim: true }), { tur: "bekle" });
  });

  test("bir haftadan fazla gecikmişse ve kartın süresi geçmişse çekim yok", () => {
    assert.deepEqual(yenilemeKarari({ ...D, bugun: "2026-11-07", hatirlatilanDonem: "2026-10-31" }), { tur: "cek", donem: "2026-10-31" });
    assert.deepEqual(yenilemeKarari({ ...D, bugun: "2026-11-08", hatirlatilanDonem: "2026-10-31" }), { tur: "durdur", neden: "cok-gecikti" });
    assert.deepEqual(yenilemeKarari({ ...D, kartSuresiGecti: true }), { tur: "durdur", neden: "kart-suresi" });
  });

  test("dönem sonu bilinmiyorsa bekle", () => {
    assert.deepEqual(yenilemeKarari({ ...D, donemSonu: null }), { tur: "bekle" });
  });

  test("bildirim metinleri tutarı ve kartı söyler", () => {
    const h = yenilemeBildirimi({ tur: "hatirlat", urun: "ArvoOS", donem: "2026-10-31", tutar: 239000, son4: "4358" });
    assert.match(h.metin, /31 Ekim 2026/);
    assert.match(h.metin, /4358/);
    assert.match(h.metin, /2\.390,00/);
    assert.match(yenilemeBildirimi({ tur: "basarisiz", urun: "ArvoOS", mesaj: "Limit yetersiz", kalanDeneme: 2 }).metin, /kalan 2 deneme/);
  });
});
