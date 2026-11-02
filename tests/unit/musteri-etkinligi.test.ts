import assert from "node:assert/strict";
import test from "node:test";
import { etkinlikHali, etkinlikYazisi, kurumEtkinligi, yenilemeRiski } from "@/lib/musteri-etkinligi";

/*
  Müşteri etkinliği (lib/musteri-etkinligi.ts). 02.11.2026'ya kadar
  konsol bir müşterinin paneli kullanıp kullanmadığını göstermiyordu.
*/
const SIMDI = Date.parse("2026-11-02T12:00:00Z");
const gunOnce = (g: number) => new Date(SIMDI - g * 86_400_000).toISOString();

test("kurum başına son görülme ve son 7 günde giren kişi", () => {
  const e = kurumEtkinligi([
    { organization_id: "a", last_seen_at: gunOnce(10) },
    { organization_id: "a", last_seen_at: gunOnce(2) },
    { organization_id: "a", last_seen_at: gunOnce(6) },
    { organization_id: "b", last_seen_at: gunOnce(40) },
  ], SIMDI);
  assert.deepEqual(e.get("a"), { son: gunOnce(2), haftalik: 2, toplam: 3 });
  assert.deepEqual(e.get("b"), { son: gunOnce(40), haftalik: 0, toplam: 1 });
  assert.equal(e.get("c"), undefined);
});

test("etkinlik hali ve yazısı", () => {
  assert.equal(etkinlikHali(gunOnce(3), SIMDI), "aktif");
  assert.equal(etkinlikHali(gunOnce(15), SIMDI), "azaliyor");
  assert.equal(etkinlikHali(gunOnce(30), SIMDI), "sessiz");
  // Kurulup hiç kullanılmayan müşteri de sessiz.
  assert.equal(etkinlikHali(null, SIMDI), "sessiz");
  assert.equal(etkinlikYazisi(gunOnce(0.2), SIMDI), "Bugün");
  assert.equal(etkinlikYazisi(gunOnce(1.2), SIMDI), "Dün");
  assert.equal(etkinlikYazisi(gunOnce(9), SIMDI), "9 gün önce");
  assert.equal(etkinlikYazisi(null, SIMDI), "Hiç girilmedi");
});

test("risk: yenilemesi 30 gün içinde ve etkin değil", () => {
  const yakin = gunOnce(-10); // 10 gün sonra
  const uzak = gunOnce(-60);
  assert.equal(yenilemeRiski({ acik: true, yenileme: yakin, son: gunOnce(25) }, SIMDI), true);
  assert.equal(yenilemeRiski({ acik: true, yenileme: yakin, son: null }, SIMDI), true);
  // Etkin müşteri risk değil.
  assert.equal(yenilemeRiski({ acik: true, yenileme: yakin, son: gunOnce(1) }, SIMDI), false);
  // Yenilemesi uzak sessiz müşteri "bu hafta ara" listesine girmiyor.
  assert.equal(yenilemeRiski({ acik: true, yenileme: uzak, son: null }, SIMDI), false);
  // Lisansı kapalı ya da yenilemesi yok: risk sorusu anlamsız.
  assert.equal(yenilemeRiski({ acik: false, yenileme: yakin, son: null }, SIMDI), false);
  assert.equal(yenilemeRiski({ acik: true, yenileme: null, son: null }, SIMDI), false);
});
