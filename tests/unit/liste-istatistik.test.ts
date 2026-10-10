import assert from "node:assert/strict";
import test from "node:test";
import { aylik, aylikDilimler, enCok, gunOnce, oran, ortanca, son30Degisim } from "@/lib/liste-istatistik";

/* Liste sayfalarındaki istatistik kartının hesapları. */

const simdi = Date.parse("2026-10-08T12:00:00Z");
const gunOnceTarih = (gun: number) => new Date(simdi - gun * 86_400_000).toISOString();

test("gün farkı; gelecek tarih 0", () => {
  assert.equal(gunOnce(gunOnceTarih(5), simdi), 5);
  assert.equal(gunOnce("2026-12-01T00:00:00Z", simdi), 0);
});

test("son 30 gün ve önceki 30 güne göre değişim", () => {
  const tarihler = [1, 2, 3, 40].map(gunOnceTarih);
  assert.deepEqual(son30Degisim(tarihler, simdi), { son30: 3, degisim: 200 });
  assert.deepEqual(son30Degisim([gunOnceTarih(1)], simdi), { son30: 1, degisim: null });
});

test("oran: payda sıfırsa yok", () => {
  assert.equal(oran(1, 3), 33);
  assert.equal(oran(0, 0), null);
});

test("en sık değerler", () => {
  assert.deepEqual(enCok(["a", "b", "a", "c", "a", "b"], 2), [["a", 3], ["b", 2]]);
});

test("aylık dilimler Türkiye saatiyle; dışarıda kalanlar sayılmaz", () => {
  const sonuc = aylik(
    [
      { tarih: "2026-10-02T10:00:00Z", tutar: 100 },
      // UTC'de 30 Eylül 22:00 = Türkiye'de 1 Ekim 01:00: Ekim'e düşer
      { tarih: "2026-09-30T22:00:00Z", tutar: 50 },
      { tarih: "2026-08-15T10:00:00Z", tutar: 10 },
      { tarih: "2026-01-15T10:00:00Z", tutar: 999 },
      { tarih: null },
    ],
    3,
    simdi,
  );
  assert.deepEqual(sonuc, [
    { ad: "Ağu", adet: 1, toplam: 10 },
    { ad: "Eyl", adet: 0, toplam: 0 },
    { ad: "Eki", adet: 2, toplam: 150 },
  ]);
});

test("ortanca: aykırı tek değer sonucu çekmez", () => {
  assert.equal(ortanca([30, 36, 40, 5_466_666]), 38);
  assert.equal(ortanca([36, 10, 40]), 36);
  assert.equal(ortanca([]), 0);
});

test("veritabanından gelen ay dilimleri boş ayları da çiziyor", () => {
  /* Sayım veritabanına taşınınca yalnızca kayıt OLAN aylar dönüyor;
     boş ay düşerse "Eylül'de hiç teklif yok" bilgisi kayboluyor ve
     sütunlar yanıltıcı biçimde bitişik duruyor. */
  const an = Date.parse("2026-10-11T09:00:00+03:00");
  const dilimler = aylikDilimler([{ ay: "2026-10", adet: 2, toplam: 500 }, { ay: "2026-08", adet: 1, toplam: 100 }], 6, an);
  assert.deepEqual(dilimler.map((d) => d.ad), ["May", "Haz", "Tem", "Ağu", "Eyl", "Eki"]);
  assert.deepEqual(dilimler.map((d) => d.adet), [0, 0, 0, 1, 0, 2]);
  assert.deepEqual(dilimler.map((d) => d.toplam), [0, 0, 0, 100, 0, 500]);
  // Pencerenin dışındaki ay sessizce atılıyor, toplamı şişirmiyor.
  assert.equal(aylikDilimler([{ ay: "2025-01", adet: 9, toplam: 900 }], 6, an).reduce((t, d) => t + d.adet, 0), 0);
});
