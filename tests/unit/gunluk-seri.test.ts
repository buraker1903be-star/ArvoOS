import assert from "node:assert/strict";
import test from "node:test";
import { donemDegisimi, gunlukSeri, gunlukSeriDilimler } from "@/lib/gunluk-seri";

/*
  Genel bakış grafiği (ana ekran ve modül genel bakışları). Gün sınırı
  Türkiye saatiyle; önceki dönem kıyası aynı uzunlukta pencereyle.
*/

// 08.10.2026 12:00 İstanbul = 09:00 UTC
const SIMDI = Date.parse("2026-10-08T09:00:00Z");

test("bugün dahil 14 gün; son gün bugün", () => {
  const seri = gunlukSeri([], SIMDI);
  assert.equal(seri.days.length, 14);
  assert.equal(seri.days[13].key, "2026-10-08");
  assert.equal(seri.days[0].key, "2026-09-25");
  assert.ok(seri.days[13].isToday);
});

test("gece 01:00 İstanbul'daki kayıt aynı güne düşer (UTC'de önceki gün)", () => {
  // 08.10 01:00 İstanbul = 07.10 22:00 UTC
  const seri = gunlukSeri(["2026-10-07T22:00:00Z"], SIMDI);
  assert.equal(seri.today, 1);
});

test("toplam, önceki dönem ve yüzde değişim", () => {
  const seri = gunlukSeri([
    "2026-10-08T06:00:00Z", "2026-10-01T06:00:00Z", // bu dönem: 2
    "2026-09-20T06:00:00Z", "2026-09-15T06:00:00Z", "2026-09-12T06:00:00Z", "2026-09-11T06:00:00Z", // önceki: 4
    "2026-08-01T06:00:00Z", // pencere dışı
  ], SIMDI);
  assert.equal(seri.total, 2);
  assert.equal(seri.previous, 4);
  assert.equal(seri.delta, -50);
});

test("önceki dönem boşsa yüzde yok; ağırlık (tutar) verilebilir", () => {
  assert.equal(gunlukSeri(["2026-10-08T06:00:00Z"], SIMDI).delta, null);
  const seri = gunlukSeri(["2026-10-08T06:00:00Z", "2026-10-08T07:00:00Z"], SIMDI, 7, [1500, 2500]);
  assert.equal(seri.days.length, 7);
  assert.equal(seri.today, 4000);
  assert.equal(seri.max, 4000);
});

/*
  VERİTABANINDAN GELEN DİLİMLER (gunlukSeriDilimler). Sayım artık
  SQL'de; burada sınanan, özetin ekrana doğru oturması: boş günler
  görünüyor mu, pencere dışı günler önceki döneme mi yazılıyor, çok
  eskisi dışarıda mı kalıyor.
*/
test("özet dilimlere oturuyor; kayıt olmayan gün boş çubuk", () => {
  const seri = gunlukSeriDilimler([{ gun: "2026-10-08", adet: 3 }, { gun: "2026-10-06", adet: 1 }], SIMDI);
  assert.equal(seri.days.length, 14);
  assert.equal(seri.today, 3);
  assert.equal(seri.days[11].count, 1, "6 Ekim dilimi");
  assert.equal(seri.days[12].count, 0, "7 Ekim'de kayıt yok, dilim duruyor");
  assert.equal(seri.total, 4);
});

test("pencere dışı günler önceki döneme, çok eskisi hiçbir yere", () => {
  const seri = gunlukSeriDilimler([
    { gun: "2026-10-08", adet: 2 },
    { gun: "2026-09-24", adet: 5 }, // pencerenin bir gün öncesi → önceki dönem
    { gun: "2026-09-25", adet: 1 }, // pencerenin ilk günü → bu dönem
    { gun: "2026-09-10", adet: 9 }, // 28 günden eski → dışarıda
  ], SIMDI);
  assert.equal(seri.total, 3);
  assert.equal(seri.previous, 5);
  assert.equal(seri.delta, -40);
});

test("boş özet: on dört boş gün, yüzde yok", () => {
  const seri = gunlukSeriDilimler([], SIMDI);
  assert.equal(seri.total, 0);
  assert.equal(seri.previous, 0);
  assert.equal(seri.delta, null);
  assert.equal(seri.max, 1, "sıfır bölme olmasın diye taban 1");
});

/*
  OS-02 (09.11.2026): önceki dönem de takvim günüyle ve yüzde metni tek
  kuraldan (donemDegisimi).
*/
test("önceki dönem takvim günüyle: bu dönemin ilk gününden önceki günün tamamı önceki döneme", () => {
  // SIMDI 08.10 12:00 İstanbul; bu dönem 25.09–08.10, önceki 11.09–24.09.
  // 24.09 20:00 İstanbul (17:00 UTC): eskiden kayan saatle (14 günden az önce
  // değil) hiçbir yere sayılmıyordu.
  const seri = gunlukSeri(["2026-09-24T17:00:00Z", "2026-09-11T05:00:00Z", "2026-09-10T20:00:00Z"], SIMDI);
  assert.equal(seri.total, 0);
  assert.equal(seri.previous, 2, "24.09 akşamı ve 11.09 sabahı önceki dönemde; 10.09 dışarıda");
  assert.equal(seri.aralik, "25 Eyl – 8 Eki");
  assert.equal(seri.oncekiAralik, "11 Eyl – 24 Eyl");
});

test("dönem değişimi: pozitif, negatif, eşit, −%100", () => {
  assert.deepEqual(donemDegisimi({ total: 6, previous: 4 }, { adet: "talep" }), { tur: "artis", yuzde: 50, metin: "+%50 önceki 14 güne göre", ton: "success" });
  assert.deepEqual(donemDegisimi({ total: 3, previous: 4 }, { adet: "talep" }), { tur: "azalis", yuzde: -25, metin: "−%25 önceki 14 güne göre", ton: "danger" });
  const esit = donemDegisimi({ total: 4, previous: 4 }, { adet: "talep" });
  assert.equal(esit.tur, "esit");
  assert.equal(esit.ton, "neutral", "değişim yokken büyüme rengi yok");
  assert.ok(!esit.metin.includes("+"));
  const sifir = donemDegisimi({ total: 0, previous: 5 }, { adet: "talep" });
  assert.equal(sifir.yuzde, -100);
  assert.equal(sifir.metin, "−%100 önceki 14 güne göre");
});

test("dönem değişimi: önceki dönem sıfır → yüzde yok, nötr; ikisi de sıfır → değişim yok", () => {
  const yeni = donemDegisimi({ total: 3, previous: 0 }, { adet: "talep" });
  assert.equal(yeni.tur, "onceki-yok");
  assert.equal(yeni.yuzde, null);
  assert.equal(yeni.ton, "neutral");
  assert.match(yeni.metin, /Önceki 14 günde talep yok/);
  assert.ok(!/%/.test(yeni.metin), "tanımsız değişim için yüzde yok");
  const bos = donemDegisimi({ total: 0, previous: 0 }, { adet: "talep" });
  assert.equal(bos.tur, "ikisi-sifir");
  assert.equal(bos.ton, "neutral");
  assert.match(bos.metin, /Değişim yok/);
});

test("dönem değişimi: okunamayan veri sıfırdan ayrı", () => {
  const hata = donemDegisimi({ total: 0, previous: 0 }, { adet: "talep", hata: true });
  assert.equal(hata.tur, "yuklenemedi");
  assert.equal(hata.ton, "warning");
  assert.equal(hata.yuzde, null);
  assert.match(hata.metin, /yüklenemedi/);
});

test("dönem uzunluğu metne yansıyor (7 günlük seri)", () => {
  assert.equal(donemDegisimi({ total: 2, previous: 1 }, { adet: "talep", gun: 7 }).metin, "+%100 önceki 7 güne göre");
});

/*
  KÜÇÜK FARKLAR (10.11.2026): yüzde yuvarlanınca sıfır olan fark "değişim
  yok" sayılıyordu. "Değişim yok" yalnızca toplamlar eşitse.
*/
test("1000 → 1001: yön korunur, '%1'den az artış', +%0 yok", () => {
  const d = donemDegisimi({ total: 1001, previous: 1000 }, { adet: "talep" });
  assert.equal(d.tur, "artis");
  assert.equal(d.ton, "success");
  assert.equal(d.metin, "önceki 14 güne göre %1'den az artış");
  assert.ok(d.yuzde !== null && d.yuzde > 0 && d.yuzde < 1);
  assert.ok(!/[+−-]%0\b/.test(d.metin));
});

test("1000 → 999: yön korunur, '%1'den az azalış', −%0 yok", () => {
  const d = donemDegisimi({ total: 999, previous: 1000 }, { adet: "talep" });
  assert.equal(d.tur, "azalis");
  assert.equal(d.ton, "danger");
  assert.equal(d.metin, "önceki 14 güne göre %1'den az azalış");
  assert.ok(d.yuzde !== null && d.yuzde < 0 && d.yuzde > -1);
});

test("yalnızca eşit toplam 'değişim yok'; sıfıra düşüş −%100; sıfır tabanlı artışta yüzde yok", () => {
  assert.deepEqual(donemDegisimi({ total: 1000, previous: 1000 }, { adet: "talep" }), { tur: "esit", yuzde: 0, metin: "önceki 14 güne göre değişim yok", ton: "neutral" });
  const dusus = donemDegisimi({ total: 0, previous: 1000 }, { adet: "talep" });
  assert.equal(dusus.metin, "−%100 önceki 14 güne göre");
  assert.equal(dusus.tur, "azalis");
  const sifirTaban = donemDegisimi({ total: 5, previous: 0 }, { adet: "talep" });
  assert.equal(sifirTaban.tur, "onceki-yok");
  assert.equal(sifirTaban.yuzde, null);
  assert.ok(!/%/.test(sifirTaban.metin));
});

test("tahsilat tutarları (kuruş): ₺10.000 → ₺10.040 artış, %1 sınırı ve yuvarlama", () => {
  assert.equal(donemDegisimi({ total: 1_004_000, previous: 1_000_000 }, { adet: "tahsilat" }).metin, "önceki 14 güne göre %1'den az artış");
  assert.equal(donemDegisimi({ total: 1_010_000, previous: 1_000_000 }, { adet: "tahsilat" }).metin, "+%1 önceki 14 güne göre");
  assert.equal(donemDegisimi({ total: 1_014_900, previous: 1_000_000 }, { adet: "tahsilat" }).metin, "+%1 önceki 14 güne göre");
  assert.equal(donemDegisimi({ total: 990_000, previous: 1_000_000 }, { adet: "tahsilat" }).metin, "−%1 önceki 14 güne göre");
});
