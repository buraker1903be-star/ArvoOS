import assert from "node:assert/strict";
import test from "node:test";
import { istanbulDateTime, istanbulMidnight, istanbulMonthStart, istanbulTime, istanbulTimestamp, monthStartKey, todayInIstanbul } from "@/lib/istanbul-date";

/*
  SUNUCUNUN KOŞULU: Vercel UTC'de çalışıyor, geliştirme makinesi
  Türkiye'de. Dilim sabitlenmezse bu dosyanın tamamı makinede yeşil,
  canlıda yanlış olur: dilimsiz bir biçimlendirme Türkiye'deki makinede
  zaten doğru saati yazar. Buradaki işlevlerin hepsi dilimi kendi
  veriyor, yani UTC'ye almak başka bir testi bozmaz.
*/
process.env.TZ = "UTC";

test("gece 00:00–03:00 arası tarih bir gün geri kaymaz", () => {
  // Gerileme: sunucu UTC'de çalıştığı için ayın 1'inde gece girilen tahsilat
  // önceki aya düşüyordu.
  assert.equal(todayInIstanbul(new Date("2026-03-01T00:30:00Z")), "2026-03-01");
  assert.equal(todayInIstanbul(new Date("2026-02-28T22:30:00Z")), "2026-03-01");
  assert.equal(todayInIstanbul(new Date("2026-03-01T20:59:59Z")), "2026-03-01");
  assert.equal(todayInIstanbul(new Date("2026-03-01T21:00:00Z")), "2026-03-02");
});

test("Türkiye yaz saati uygulamaz: yıl boyu UTC+3", () => {
  assert.equal(todayInIstanbul(new Date("2026-07-15T21:30:00Z")), "2026-07-16");
  assert.equal(todayInIstanbul(new Date("2026-01-15T21:30:00Z")), "2026-01-16");
});

test("gün anahtarı Türkiye gece yarısının UTC anına çevrilir", () => {
  assert.equal(istanbulMidnight("2026-03-01").toISOString(), "2026-02-28T21:00:00.000Z");
});

test("ay başı anahtarı, ay taşmasıyla birlikte", () => {
  assert.equal(monthStartKey(2026, 3), "2026-03-01");
  assert.equal(monthStartKey(2026, 13), "2027-01-01", "13. ay sonraki yıla taşar");
  assert.equal(monthStartKey(2026, 0), "2025-12-01", "0. ay önceki yıla taşar");
});

test("ay başı Türkiye gece yarısıdır, UTC gece yarısı değil", () => {
  /*
    Gerileme: lib/urun-kullanimi.ts ay sınırını kendi hesaplıyor ve UTC gece
    yarısı üretiyordu — Türkiye'de ayın 1'inde saat 03:00. Ayın ilk üç
    saatinde kaydedilen kullanım o ayın sayımına GİRMİYORDU; önceki ayın
    penceresi de kapandığı için hiçbir aya girmiyordu. Ölçüm her ay üç saat
    kaybediyor ve bu doğrudan kredi/kota kararına giriyor.
  */
  assert.equal(istanbulMonthStart(new Date("2026-10-15T09:00:00Z")).toISOString(), "2026-09-30T21:00:00.000Z");

  // Ayın 1'inde gece 00:30 (İstanbul) kaydedilen kullanım sınırın İÇİNDE.
  const geceKaydi = new Date("2026-09-30T21:30:00Z"); // = 2026-10-01 00:30 +03
  assert.ok(geceKaydi >= istanbulMonthStart(geceKaydi), "ayın ilk saatleri o aya sayılmalı");

  // Ayın son anı (İstanbul 23:59) hâlâ eski aya ait.
  const ayinSonu = new Date("2026-09-30T20:59:59Z"); // = 2026-09-30 23:59 +03
  assert.equal(istanbulMonthStart(ayinSonu).toISOString(), "2026-08-31T21:00:00.000Z");
});

test("ay başı yıl sınırını doğru geçer", () => {
  const ocakGecesi = new Date("2026-12-31T21:30:00Z"); // = 2027-01-01 00:30 +03
  assert.equal(istanbulMonthStart(ocakGecesi).toISOString(), "2026-12-31T21:00:00.000Z");
});

test("randevu saati Türkiye saatiyle kaydedilir ve gösterilir", () => {
  /*
    Gerileme: randevu kaydı saati sunucunun yerel saatiyle çeviriyordu; UTC'de
    çalışan sunucuda 14:00 randevusu 3 saat kaymış kaydediliyordu.
  */
  assert.equal(istanbulTimestamp("2026-10-08", "14:00")?.toISOString(), "2026-10-08T11:00:00.000Z");
  assert.equal(istanbulTimestamp("2026-10-08", "01:30")?.toISOString(), "2026-10-07T22:30:00.000Z", "gece randevusu önceki UTC gününe düşer");
  assert.equal(istanbulTime(new Date("2026-10-08T11:00:00Z")), "14:00");
  assert.equal(istanbulTime(new Date("2026-10-07T22:30:00Z")), "01:30");
  assert.equal(todayInIstanbul(new Date("2026-10-07T22:30:00Z")), "2026-10-08", "gece randevusu Türkiye gününe yazılır");
  assert.equal(istanbulTimestamp("2026-10-08", ""), null);
  assert.equal(istanbulTimestamp("08.10.2026", "14:00"), null);
  assert.equal(istanbulTimestamp("2026-13-40", "14:00"), null);
});

test("kayıt geçmişi damgası Türkiye saatiyle yazılır", () => {
  /*
    Gerileme: kayıt geçmişi damgayı dilimsiz biçimlendiriyordu ve sunucu
    UTC'de çalıştığı için üç saat geri yazıyordu. İş detayında aynı aşama
    tamamlama olayı üstteki listede 18:09, alttakinde 15:09 görünüyordu
    (15.10.2026).
  */
  const an = "2026-10-15T15:09:00Z"; // = 15 Ekim 2026, 18:09 +03
  assert.equal(istanbulDateTime(an, { dateStyle: "medium", timeStyle: "short" }), "15 Eki 2026 18:09");

  // Gün de kayıyordu: Türkiye'de gece yarısından sonrası UTC'de bir önceki gün.
  const geceYarisindanSonra = "2026-10-15T22:30:00Z"; // = 16 Ekim 2026, 01:30 +03
  assert.equal(
    istanbulDateTime(geceYarisindanSonra, { day: "numeric", month: "long", year: "numeric" }),
    "16 Ekim 2026",
  );

  // Boş ve bozuk değerler ekrana çöp yazmaz.
  assert.equal(istanbulDateTime(null), "—");
  assert.equal(istanbulDateTime(""), "—");
  assert.equal(istanbulDateTime("elma"), "—");
  assert.equal(istanbulDateTime(null, {}, ""), "");
});
